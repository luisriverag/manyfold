import * as Comlink from 'comlink'
import 'src/comlink_event_handler'

import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeMFLoader } from 'threejs-webworker-3mf-loader'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { OrbitControls } from 'src/orbit_controls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { CanvasProxy } from 'src/canvas_proxy'

export class OffscreenRenderer {
  canvas: CanvasProxy
  renderer: THREE.WebGLRenderer
  settings: DOMStringMap
  scene: THREE.Scene
  composer: THREE.EffectComposer
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  gridHelper: THREE.GridHelper
  ready: boolean = false

  cbLoadComplete: any = null
  cbLoadProgress: any = null
  cbLoadError: any = null

  constructor (
    canvas: HTMLCanvasElement,
    settings: DOMStringMap
  ) {
    this.canvas = new CanvasProxy(canvas)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas.realCanvas })
    this.settings = settings
    this.setup()
  }

  handleEvent (event): void {
    this.canvas.handleEvent(event)
  }

  setup (): void {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(this.settings.backgroundColour ?? '#000000')
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.1,
      100000
    )
    this.controls = new OrbitControls(this.camera, this.canvas as any)
    this.controls.enableDamping = true
    this.controls.enablePan = this.controls.enableZoom = (this.settings.enablePanZoom === 'true')
    this.controls.keyPanSpeed = 35
    this.controls.keyRotateFactor = 10
    this.controls.listenToKeyEvents(this.canvas as unknown as HTMLElement)
    // Add lighting
    const gridSizeX = parseInt(this.settings.gridSizeX ?? '10', 10)
    const gridSizeZ = parseInt(this.settings.gridSizeZ ?? '10', 10)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcccccc))
    const light = new THREE.DirectionalLight()
    light.position.set(gridSizeX, 50, gridSizeZ)
    this.scene.add(light)
    const light2 = new THREE.DirectionalLight()
    light2.position.set(-gridSizeX, 50, gridSizeZ)
    this.scene.add(light2)
    // Set up render passes
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    if (this.settings.renderStyle === 'shadowed') {
      const ssaoPass = new SSAOPass(this.scene, this.camera)
      ssaoPass.output = SSAOPass.OUTPUT.Default
      ssaoPass.minDistance = 0
      ssaoPass.maxDistance = 50
      this.composer.addPass(ssaoPass)
    }
    this.composer.addPass(new OutputPass())
  }

  load (cbLoadComplete, cbLoadProgress, cbLoadError): void {
    // Store callbacks
    this.cbLoadComplete = cbLoadComplete
    this.cbLoadProgress = cbLoadProgress
    this.cbLoadError = cbLoadError
    // Load
    let loader: OBJLoader | STLLoader | ThreeMFLoader | PLYLoader | GLTFLoader | null = null
    switch (this.settings.format) {
      case 'obj':
        loader = new OBJLoader()
        break
      case 'stl':
        loader = new STLLoader()
        break
      case '3mf':
        loader = new ThreeMFLoader()
        break
      case 'ply':
        loader = new PLYLoader()
        break
      case 'gltf':
      case 'glb':
        loader = new GLTFLoader()
        break
    }
    if (loader !== null) {
      loader.load(
        this.settings.previewUrl ?? '',
        this.onLoad.bind(this),
        this.onLoadProgress.bind(this),
        this.onLoadError.bind(this)
      )
    }
  }

  onLoadProgress (xhr): void {
    const percentage = Math.floor((xhr.loaded / xhr.total) * 100)
    this.cbLoadProgress(percentage)
  }

  onLoad (model): void {
    const material = this.settings.renderStyle === 'normals'
      ? new THREE.MeshNormalMaterial({
        flatShading: true
      })
      : new THREE.MeshLambertMaterial({
        flatShading: true,
        color: (this.settings.objectColour ?? '#cccccc')
      })
    // find mesh
    let object: THREE.Mesh | THREE.Group | null = null
    if (model.type === 'BufferGeometry') {
      object = new THREE.Mesh(model, material)
    } else if ('scene' in model) {
      object = model.scene
    } else {
      object = model
    }
    // Set material
    if (object == null) { return }
    object.traverse(function (node: THREE.Mesh) {
      if (node.isMesh === true) {
        node.material = material
      }
    })
    // Transform to screen coords from print
    if (this.settings.yUp !== 'true') {
      const coordSystemTransform = new THREE.Matrix4()
      coordSystemTransform.set(
        1,
        0,
        0,
        0, // x -> x
        0,
        0,
        1,
        0, // z -> y
        0,
        -1,
        0,
        0, // y -> -z
        0,
        0,
        0,
        1
      )
      object.applyMatrix4(coordSystemTransform)
    }
    // Calculate bounding volumes
    const bbox = new THREE.Box3().setFromObject(object)
    const centre = new THREE.Vector3()
    bbox.getCenter(centre)
    const bsphere = new THREE.Sphere()
    bbox.getBoundingSphere(bsphere)
    const modelHeight = bbox.max.y - bbox.min.y
    // Centre the model
    object.position.set(-centre.x, -bbox.min.y, -centre.z)

    // Configure camera
    this.camera.position.z = this.camera.position.x = bsphere.radius * 1.63
    this.camera.position.y = bsphere.radius * 0.75
    this.controls.target.set(0, modelHeight / 2, 0)
    this.scene.add(object)
    // Add the grid
    if (this.settings.showGrid === 'true') {
      const gridSizeX = parseInt(this.settings.gridSizeX ?? '10', 10)
      // TODO: use grid size Z here, see #834
      this.gridHelper = new THREE.GridHelper(
        gridSizeX,
        gridSizeX / 10,
        'magenta',
        'cyan'
      )
      this.scene.add(this.gridHelper)
    }

    // Let's go!
    this.ready = true
    this.render()

    // Listen for control updates and re-render
    this.controls.addEventListener('change', this.render.bind(this))

    // Report load complete
    this.cbLoadComplete()
  }

  onLoadError (e): void {
    console.log(e)
    this.cbLoadError()
  }

  onResize (width, height, pixelRatio): void {
    this.canvas.resize(width, height)
    this.renderer.setSize(width, height, false)
    this.composer.setSize(width, height, false)
    // Update camera
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    // Update pixel ratio
    this.renderer.setPixelRatio(pixelRatio)
    this.composer.setPixelRatio(pixelRatio)
    // Render!
    this.render()
  }

  render (): void {
    setTimeout(() => {
      requestAnimationFrame(this.onAnimationFrame.bind(this))
    }, 16) // ms per 60fps frame, near enough
  }

  onAnimationFrame (): void {
    if (!this.ready || this.canvas === null || this.renderer === null) {
      return
    }
    // Update controls to allow animation of damping
    this.controls.update()
    // Render
    this.composer.render()
  }

  cleanup (): void {
    if (typeof this.scene !== 'undefined' && this.scene !== null) {
      this.scene.traverse(function (node) {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          node.material.dispose()
        }
      })
    }
  }
}

Comlink.expose(OffscreenRenderer)
