import type { ChromaKeySettings } from '../types';

// Runs entirely on the GPU via a fragment shader — chroma keying needs a per-pixel pass on every
// single rendered frame (live playback, scrubbing, and export all repaint constantly), and doing
// that on the CPU with getImageData/putImageData over a 1080p+ frame would be far too slow to stay
// real-time. A WebGL pass keeps it comfortably within a frame budget.

const VERTEX_SRC = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    // Flip Y: texture origin is top-left for images/video but WebGL clip space is bottom-up.
    v_texCoord.y = 1.0 - v_texCoord.y;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SRC = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec3 u_keyColor;
  uniform float u_similarity;
  uniform float u_smoothness;
  uniform float u_spill;
  uniform int u_dominantChannel;
  varying vec2 v_texCoord;

  // Cb/Cr-only distance (ignores luma) copes far better with shadows/highlights across a physical
  // green/blue screen than plain RGB distance would.
  vec2 rgbToUV(vec3 rgb) {
    float y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    float u = (rgb.b - y) * 0.565;
    float v = (rgb.r - y) * 0.713;
    return vec2(u, v);
  }

  vec3 suppressSpill(vec3 color, float amount) {
    if (u_dominantChannel == 1) {
      float maxOther = max(color.r, color.b);
      return vec3(color.r, mix(color.g, min(color.g, maxOther), amount), color.b);
    } else if (u_dominantChannel == 2) {
      float maxOther = max(color.r, color.g);
      return vec3(color.r, color.g, mix(color.b, min(color.b, maxOther), amount));
    } else {
      float maxOther = max(color.g, color.b);
      return vec3(mix(color.r, min(color.r, maxOther), amount), color.g, color.b);
    }
  }

  void main() {
    vec4 texColor = texture2D(u_image, v_texCoord);
    float dist = distance(rgbToUV(texColor.rgb), rgbToUV(u_keyColor));

    float edge0 = u_similarity;
    float edge1 = u_similarity + u_smoothness + 0.0001;
    float alpha = smoothstep(edge0, edge1, dist);

    float spillStrength = clamp(u_spill * (1.0 - alpha), 0.0, 1.0);
    vec3 color = suppressSpill(texColor.rgb, spillStrength);

    gl_FragColor = vec4(color, texColor.a * alpha);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Chroma key shader failed to compile: ${info}`);
  }
  return shader;
}

function hexToRgbNormalized(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 1, Number.isFinite(b) ? b : 0];
}

/** Runs the chroma-key shader against a video/image/canvas source and returns a canvas with the key color made transparent. */
export class ChromaKeyer {
  private canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext;
  private texture: WebGLTexture;
  private uniforms: {
    keyColor: WebGLUniformLocation;
    similarity: WebGLUniformLocation;
    smoothness: WebGLUniformLocation;
    spill: WebGLUniformLocation;
    dominantChannel: WebGLUniformLocation;
  };

  constructor() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
    if (!gl) throw new Error('WebGL is not available — chroma key requires it.');
    this.gl = gl;

    const program = gl.createProgram()!;
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Chroma key program failed to link: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);

    // A full-screen quad (two triangles via TRIANGLE_STRIP) in clip space.
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.texture = texture;

    this.uniforms = {
      keyColor: gl.getUniformLocation(program, 'u_keyColor')!,
      similarity: gl.getUniformLocation(program, 'u_similarity')!,
      smoothness: gl.getUniformLocation(program, 'u_smoothness')!,
      spill: gl.getUniformLocation(program, 'u_spill')!,
      dominantChannel: gl.getUniformLocation(program, 'u_dominantChannel')!,
    };
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  }

  apply(source: CanvasImageSource, width: number, height: number, settings: ChromaKeySettings): HTMLCanvasElement {
    const gl = this.gl;
    if (width <= 0 || height <= 0) return this.canvas;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    } catch {
      return this.canvas; // source not decodable yet (e.g. mid-seek) — keep showing the last good frame
    }

    const [r, g, b] = hexToRgbNormalized(settings.color);
    gl.uniform3f(this.uniforms.keyColor, r, g, b);
    gl.uniform1f(this.uniforms.similarity, settings.similarity / 100);
    gl.uniform1f(this.uniforms.smoothness, Math.max(0.001, settings.smoothness / 100));
    gl.uniform1f(this.uniforms.spill, settings.spill / 100);
    const maxChannel = Math.max(r, g, b);
    gl.uniform1i(this.uniforms.dominantChannel, r === maxChannel ? 0 : g === maxChannel ? 1 : 2);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

let singleton: ChromaKeyer | null = null;
export function getChromaKeyer(): ChromaKeyer {
  if (!singleton) singleton = new ChromaKeyer();
  return singleton;
}
