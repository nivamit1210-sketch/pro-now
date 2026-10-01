import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

export interface PostProcessingHandle {
  composer: EffectComposer;
  gradeUniforms: { uTime: { value: number }; uAspect: { value: number } };
  resize(width: number, height: number): void;
  render(timeMs: number): void;
  dispose(): void;
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  day: boolean,
  coarse: boolean,
): PostProcessingHandle {
  const w = renderer.domElement.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || window.innerHeight;
  const dpr = renderer.getPixelRatio();

  const target = new THREE.WebGLRenderTarget(w * dpr, h * dpr, {
    type: THREE.HalfFloatType,
    samples: coarse ? 2 : 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);

  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    day ? 0.12 : 0.3,
    0.5,
    0.96,
  );
  composer.addPass(bloom);

  const gradeUniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: w / Math.max(1, h) },
  };
  const grade = new ShaderPass({
    uniforms: gradeUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(vec2(c.x * uAspect, c.y)) / length(vec2(uAspect, 1.0) * 0.5);
        vec2 off = c * (r * r) * 0.0012;
        vec3 col;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
        float vig = 1.0 - 0.34 * smoothstep(0.55, 1.25, r);
        col *= vig;
        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float n = fract(sin(dot(vUv * vec2(1024.0, 768.0) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * 0.011 * smoothstep(0.02, 0.16, luma) * (1.0 - smoothstep(0.16, 0.6, luma));
        col = mix(col * vec3(0.94, 0.97, 1.06), col * vec3(1.04, 1.0, 0.96), smoothstep(0.08, 0.6, luma));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  composer.addPass(grade);

  return {
    composer,
    gradeUniforms,
    resize(width: number, height: number) {
      composer.setSize(width, height);
      bloom.setSize(width, height);
      gradeUniforms.uAspect.value = width / Math.max(1, height);
    },
    render(timeMs: number) {
      gradeUniforms.uTime.value = (timeMs % 10000) / 1000;
      composer.render();
    },
    dispose() {
      target.dispose();
      composer.dispose();
    },
  };
}
