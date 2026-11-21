import React, { useEffect } from 'react'

import { FaceletCubeT, Face } from "../lib/Defs";
import * as THREE from 'three';
import chroma from 'chroma-js';
// @ts-ignore - chroma.mix is a module-level function present at runtime
import { OrbitControls } from '../lib/three/OrbitControls';

type Config = {
    cube: FaceletCubeT, width: number, height: number, colorScheme: Array<string>, facesToReveal: Face[],
    theme: string,
    hintDistance?: number,
    enableControl? : boolean,
    obscureNonLR? : boolean,
    obscureStickerWidth?: string,
    obscureCornerMask?: boolean
}
let { Vector3 } = THREE

type AxesInfo = [THREE.Vector3, THREE.Euler]
const TAU = Math.PI * 2;
const axesInfo: [THREE.Vector3, THREE.Euler][] = [
    // UDFBLR
    [new THREE.Vector3(0, 1, 0), new THREE.Euler(-TAU / 4, 0, 0)],
    [new THREE.Vector3(0, -1, 0), new THREE.Euler(TAU / 4, 0, 0)],
    [new THREE.Vector3(0, 0, 1), new THREE.Euler(0, 0, 0)],
    [new THREE.Vector3(0, 0, -1), new THREE.Euler(0, TAU / 2, 0)],
    [new THREE.Vector3(-1, 0, 0), new THREE.Euler(0, -TAU / 4, 0)],
    [new THREE.Vector3(1, 0, 0), new THREE.Euler(0, TAU / 4, 0)],
];


enum CameraState {
    HOME,
    PEEK_UFL,
    PEEK_DFL,
    PEEK_DFR,
    PEEK_UBR,
    PEEK_UBL
}
type ConfigT = {width: number, height: number, colorScheme: Array<string>, mode?: string,
    faces?: Face[], theme?: string, hintDistance?: number,     enableControl? : boolean,
    cameraState?: CameraState, obscureNonLR?: boolean, obscureStickerWidth?: string, obscureCornerMask?: boolean
}

const roundedFace = ((rounded?: number[], cornerRadius?: number, ) => {
    cornerRadius = cornerRadius || 0.1
    rounded = rounded || [1, 1, 1, 1]
    let geo = new THREE.BufferGeometry()
    let cornerVertices = []
    let cornerCenter = new THREE.Vector3(1 - cornerRadius, 1 - cornerRadius, 0)
    let squareCorner = new THREE.Vector3(1, 1, 0)
    for (let i = 0; i <= 90; i += 10) {
        let degree = (i * Math.PI) / 180
        cornerVertices.push(
            cornerCenter.clone().add(new THREE.Vector3(Math.cos(degree), Math.sin(degree), 0).multiplyScalar(cornerRadius))
        )
    }
    let vertices = []
    for (let i = 0; i < 4; i++) {
        if (rounded[i]) {
            vertices.push(...cornerVertices)
        } else {
            vertices.push(squareCorner.clone())
        }
        cornerVertices = cornerVertices.map(x => x.clone().applyAxisAngle(new Vector3(0, 0, 1), 0.5 * Math.PI))
        squareCorner.applyAxisAngle(new Vector3(0, 0, 1), 0.5 * Math.PI)
    }
    let faces = []
    for (let i = 0; i< vertices.length; i++) {
        let i1 = (i + 1) % vertices.length;
        faces.push(vertices[vertices.length - 1])
        faces.push(vertices[i])
        faces.push(vertices[i1])
    }
    geo.setFromPoints(faces)

    return geo
})

const getCameraPosFromState = function (cstate: CameraState) : [number[], THREE.Vector3]{
    const cameraPosUFR = [2.5, 3.5, 3]
    const cameraPosUFL = [-2, 3.5, 3]
    const cameraPosDFL = [-2, -3.5, 3]
    const cameraPosDFR = [2, -3.5, 3]
    const cameraPosUBR = [2.5, 3.5, -3]
    const cameraPosUBL = [-2, 3.5, -3]

    const upVecLookingDownUB = new THREE.Vector3(0, 0, -1)
    const upVecLookingDownUBL = new THREE.Vector3(0, 0.1, -1)
    const upVecDefault = new THREE.Vector3(0, 1, 0)
    switch (cstate) {
        case CameraState.HOME: return [cameraPosUFR, upVecDefault]
        case CameraState.PEEK_DFL: return [cameraPosDFL, upVecDefault]
        case CameraState.PEEK_DFR: return [cameraPosDFR, upVecDefault]
        case CameraState.PEEK_UFL: return [cameraPosUFL, upVecDefault]
        case CameraState.PEEK_UBL: return [cameraPosUBL, upVecLookingDownUBL]
        default: return [cameraPosUBR, upVecLookingDownUB]
    }
}

// NOTE: 每个 CubeSim 实例都拥有自己的 painter / WebGLRenderer。
// 原实现把 painter 缓存成模块级单例：多实例共用一个 canvas（TrackerView 一次渲染
// 两个 CubeSim，第二个会把第一个的 canvas 搬进自己容器），且组件卸载时从不销毁，
// renderer / rAF 循环 / geometry 全部留在内存里 —— 这是 Electron 与 Tauri 版本
// 内存持续上涨的根因。
const redraw_cube = function (cube: FaceletCubeT, config: ConfigT ) {
    let { width, height, colorScheme, mode, faces, theme, enableControl} = config
    let hintDistance = config.hintDistance || 3
    const bgColor = theme === "bright" ? "#eeeeef" : '#252525'

    mode = mode || "FRU"
    let facesToReveal = faces || [Face.L, Face.B, Face.D]

    const scene = new THREE.Scene()
    const angle = 50
    const camera = new THREE.PerspectiveCamera(angle, width / height, 0.1, 1000)

    const mag = 1.0
    const alpha = 0.5
    const enableBorder = true

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height, true);
    renderer.setClearColor(bgColor)
    renderer.setPixelRatio(window.devicePixelRatio)
    let controls = new OrbitControls( camera, renderer.domElement );
    controls.enabled = !!config.enableControl

    const angleScale = Math.sin(70 / 180 * Math.PI)  /  Math.sin(angle / 180 * Math.PI)
    const scale = (hintDistance > 5) ? .96 * angleScale : .9 * angleScale

    const cameraState = config.cameraState || CameraState.HOME
    const [cameraPositionRaw, cameraUp] = getCameraPosFromState(cameraState)
    const cameraPosition = (mode === "FRU") ?
        new THREE.Vector3(cameraPositionRaw[0] * scale,
                          cameraPositionRaw[1] * scale,
                          cameraPositionRaw[2] * scale) :
        new THREE.Vector3(0 / 1.1, 3 / 1.1, 3 / 1.1)

    camera.up.copy(cameraUp)
    camera.position.copy(cameraPosition)
    camera.aspect = width / height;
    camera.lookAt(new THREE.Vector3(0, 0, 0))

    // 模板（sticker / hint 的 geometry 与 material）只建一次；之后每次重绘只是
    // clone 出新 Mesh（共享 geometry + material，对象很小，交给 GC）。旧实现每次
    // 重绘都新建上百个 BufferGeometry 与 14 个材质，且从不 dispose。
    let stickers_tmpl: THREE.Mesh[] = []
    let stickerwrap_tmpl: THREE.Mesh
    let obscured_stickers_tmpl: THREE.Group[] = []
    let hint_mesh_tmpl: THREE.Mesh[] = []
    let obscured_hint_mesh_tmpl: THREE.Group[] = []
    let greyMaterial: THREE.MeshBasicMaterial

    const ownedGeos: THREE.BufferGeometry[] = []
    const ownedMats: THREE.Material[] = []
    let templatesBuilt = false
    let templateColorKey = ""

    const geo_border = new THREE.PlaneGeometry(2.0, 2.0)
    let materials_border = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.FrontSide })
    stickerwrap_tmpl = (() => {
        let mesh = new THREE.Mesh(geo_border, materials_border)
        mesh.setRotationFromEuler(axesInfo[0][1])
        return mesh
    })()

    const sticker_scale = 0.88
    const corner_radius = 0.4
    const hint_scale = 0.95

    const getFillScale = (widthSetting?: string) => {
        switch (widthSetting) {
            case "Thin": return 0.96
            case "Medium": return 0.92
            case "Thick": return 0.88
            default: return 0.92
        }
    }
    const fill_scale = getFillScale(config.obscureStickerWidth)
    const rounded_patterns = [
        [0, 0, 0, 1],
        [0, 0, 1, 1],
        [0, 0, 1, 0],
        [1, 0, 0, 1],
        [1, 1, 1, 1],
        [0, 1, 1, 0],
        [1, 0, 0, 0],
        [1, 1, 0, 0],
        [0, 1, 0, 0]
    ];

    const disposeTemplates = () => {
        ownedGeos.forEach(g => g.dispose())
        ownedGeos.length = 0
        ownedMats.forEach(m => m.dispose())
        ownedMats.length = 0
        templatesBuilt = false
        templateColorKey = ""
    }

    function buildTemplates(colorScheme_: Array<string>) {
        const colorKey = colorScheme_.join("|")
        if (templatesBuilt && templateColorKey === colorKey) return
        disposeTemplates()
        templateColorKey = colorKey
        templatesBuilt = true

        let materials = Array(7).fill(0).map((_, i) => {
            let mat = new THREE.MeshBasicMaterial({ color: colorScheme_[i], side: THREE.DoubleSide });
            mat.alphaTest = alpha;
            ownedMats.push(mat)
            return mat
        })

        stickers_tmpl = materials.map((mat) => {
            return rounded_patterns.map(pattern => {
                let geo = roundedFace(pattern, corner_radius)
                ownedGeos.push(geo)
                let mesh = new THREE.Mesh(geo, mat)
                mesh.scale.set(sticker_scale, sticker_scale, sticker_scale)
                mesh.setRotationFromEuler(axesInfo[0][1])
                return mesh
            })
        }).flat()

        greyMaterial = new THREE.MeshBasicMaterial({ color: colorScheme_[6], side: THREE.DoubleSide, alphaTest: alpha })
        ownedMats.push(greyMaterial)

        obscured_stickers_tmpl = materials.map((mat) => {
            return rounded_patterns.map(pattern => {
                const group = new THREE.Group()

                let fillGeo = roundedFace(pattern, corner_radius)
                ownedGeos.push(fillGeo)
                let fillMesh = new THREE.Mesh(fillGeo, greyMaterial)
                fillMesh.scale.set(sticker_scale * fill_scale, sticker_scale * fill_scale, sticker_scale * fill_scale)
                fillMesh.setRotationFromEuler(axesInfo[0][1])
                fillMesh.position.y = 0.01
                group.add(fillMesh)

                let borderGeo = roundedFace(pattern, corner_radius)
                ownedGeos.push(borderGeo)
                let borderMesh = new THREE.Mesh(borderGeo, mat)
                borderMesh.scale.set(sticker_scale, sticker_scale, sticker_scale)
                borderMesh.setRotationFromEuler(axesInfo[0][1])
                group.add(borderMesh)

                return group
            })
        }).flat()

        hint_mesh_tmpl = Array(7).fill(0).map((_, i) => {
            let color = (theme === "bright")
                ? chroma.mix(colorScheme_[i], 'white', 0.18).hex()
                : chroma.mix(colorScheme_[i], 'black', 0.35).hex()

            let mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
            ownedMats.push(mat)

            let geo = roundedFace([1,1,1,1], corner_radius)
            ownedGeos.push(geo)
            let mesh = new THREE.Mesh(geo, mat)
            mesh.scale.set(hint_scale, hint_scale, hint_scale)
            mesh.setRotationFromEuler(axesInfo[0][1])
            return mesh
        })

        obscured_hint_mesh_tmpl = Array(7).fill(0).map((_, i) => {
            const group = new THREE.Group()

            let fillGeo = roundedFace([1,1,1,1], corner_radius)
            ownedGeos.push(fillGeo)
            let fillMesh = new THREE.Mesh(fillGeo, hint_mesh_tmpl[6].material)
            fillMesh.scale.set(hint_scale * fill_scale, hint_scale * fill_scale, hint_scale * fill_scale)
            fillMesh.setRotationFromEuler(axesInfo[0][1])
            fillMesh.position.y = -0.01
            group.add(fillMesh)

            let borderGeo = roundedFace([1,1,1,1], corner_radius)
            ownedGeos.push(borderGeo)
            let borderMesh = new THREE.Mesh(borderGeo, hint_mesh_tmpl[i].material)
            borderMesh.scale.set(hint_scale, hint_scale, hint_scale)
            borderMesh.setRotationFromEuler(axesInfo[0][1])
            group.add(borderMesh)

            return group
        })
    }

    function drawCube(faces_: FaceletCubeT, colorScheme_: Array<string>): THREE.Group {
        buildTemplates(colorScheme_)

        const cube = new THREE.Group();
        for (let i = 0; i < 6; i++) {
            const cubie = new THREE.Group();
            const rot = new THREE.Matrix4().makeRotationFromEuler(axesInfo[i][1]);
            const rot1 = new THREE.Matrix4().makeRotationFromEuler(axesInfo[1][1]);
            cubie.setRotationFromMatrix(rot.multiply(rot1))
            for (let z = -1; z <= 1; z++) {
                for (let x = -1; x <= 1; x++) {
                    let idx = (z + 1) * 3 + (x + 1)
                    let colorIndex = faces_[i][idx]
                    let isLRColor = colorIndex === Face.L || colorIndex === Face.R
                    let isCorner = (x === -1 || x === 1) && (z === -1 || z === 1)
                    let shouldObscure = config.obscureNonLR && !isLRColor
                    let shouldMaskCorner = config.obscureCornerMask && isCorner && !isLRColor

                    let effectiveColorIndex = shouldMaskCorner ? 6 : colorIndex

                    const curr_tmpl = (shouldObscure && !shouldMaskCorner) ? obscured_stickers_tmpl[colorIndex * 9 + idx] : stickers_tmpl[effectiveColorIndex * 9 + idx]
                    const sticker = curr_tmpl.clone()
                    const stickerwrap = stickerwrap_tmpl.clone()

                    const eps = 0.05
                    sticker.position.copy(new THREE.Vector3(x * 2, 3, z * 2))
                    stickerwrap.position.copy(new THREE.Vector3(x * 2, 3 - eps, z * 2))

                    if (facesToReveal.indexOf(i) > -1) {
                        let isLRColorHint = colorIndex === Face.L || colorIndex === Face.R
                        let shouldObscureHint = config.obscureNonLR && !isLRColorHint
                        const stickerhint = (shouldObscureHint && !shouldMaskCorner) ?
                            obscured_hint_mesh_tmpl[faces_[i][idx]].clone() :
                            hint_mesh_tmpl[effectiveColorIndex].clone()
                        stickerhint.position.copy(new THREE.Vector3(x * 2, 3 + hintDistance, z * 2))
                        cubie.add(stickerhint)
                    }
                    if (enableBorder)
                        cubie.add(stickerwrap)

                    cubie.add(sticker)
                }

            }
            cube.add(cubie)
        }
        cube.scale.set(1 / 3, 1 / 3, 1 / 3)
        return cube
    }

    let cubeG = drawCube(cube, colorScheme)
    scene.add(cubeG)

    const render = () => {
        controls.update();
        renderer.render(scene, camera)
    }
    render()

    let frameID = -1
    const animate = () => {
        frameID = requestAnimationFrame(animate)
        renderer.render(scene, camera)
    }
    animate()

    const updateCubeAndColor = (cube: FaceletCubeT, colorScheme_: Array<string>) => {
        scene.remove(cubeG)
        cubeG.clear()           // 分离旧 Mesh（geometry / material 与模板共享，不重复分配）
        cubeG = drawCube(cube, colorScheme_)
        scene.add(cubeG)
        renderer.render(scene, camera)
        return renderer
    }

    const cleanup = () => {
        cancelAnimationFrame(frameID)
        scene.remove(cubeG)
        cubeG.clear()
        disposeTemplates()
        geo_border.dispose()
        materials_border.dispose()
        if ((controls as any).dispose) (controls as any).dispose()
        renderer.dispose()
    }
    return {
        updateCubeAndColor,
        getRenderer: () => renderer,
        cleanupFunc: cleanup,
        renderControls: render
    }
}

type Painter = {
    updateCubeAndColor: (cube: FaceletCubeT, scheme: Array<string>) => THREE.WebGLRenderer,
    getRenderer: () => THREE.WebGLRenderer,
    cleanupFunc: () => void,
    renderControls: () => void

}

function CubeSim(props: Config) {
    const mount = React.useRef<HTMLDivElement | null>(null)
    const painterRef = React.useRef<Painter | null>(null)
    const firstDraw = React.useRef(true)
    const [cameraState, setCameraState] = React.useState<CameraState>(CameraState.HOME);
    let { width, height, colorScheme, facesToReveal, hintDistance, theme, obscureNonLR, obscureStickerWidth, obscureCornerMask} = props
    const enableControl = true

    // facesToReveal 每次渲染都是新数组，用字符串做依赖比较，避免 effect 反复重建 painter
    const facesKey = (facesToReveal || []).join(",")

    // 结构性配置变化才重建 painter（尺寸 / 视角 / 主题 / 面 / 遮挡设置）
    useEffect(() => {
        const el = mount.current
        if (!el) return

        const painter = redraw_cube(props.cube, {
            width, height, colorScheme, faces: facesToReveal, theme, hintDistance, enableControl,
            cameraState, obscureNonLR, obscureStickerWidth, obscureCornerMask
        })
        painterRef.current = painter
        firstDraw.current = true

        const canvas = painter.getRenderer().domElement
        el.appendChild(canvas)

        return () => {
            painterRef.current = null
            if (canvas.parentNode === el) el.removeChild(canvas)
            painter.cleanupFunc()
            const renderer = painter.getRenderer()
            renderer.dispose()
            const gl = renderer.getContext()
            if (gl && gl.getExtension) {
                const ext = gl.getExtension('WEBGL_lose_context')
                if (ext) ext.loseContext()
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width, height, facesKey, theme, hintDistance, cameraState, obscureNonLR, obscureStickerWidth, obscureCornerMask])

    // cube / 配色变化的增量重绘：复用模板，不新建 geometry / material
    useEffect(() => {
        const painter = painterRef.current
        if (!painter) return
        if (firstDraw.current) {
            firstDraw.current = false
            return
        }
        painter.updateCubeAndColor(props.cube, colorScheme)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.cube, colorScheme])

    // 键盘控制：监听挂在 window 上，卸载时成对移除。旧实现里 cleanup 把 keyup 又
    // add 了一遍（写成了 addEventListener），且 effect 没有依赖数组，导致每次渲染
    // 都多一个永不释放的监听 —— 内存持续上涨的另一个来源。
    useEffect(() => {
        function downHandler (event: KeyboardEvent){
            if (event.key === "1") {
                setCameraState(CameraState.PEEK_DFL);
            }
            if (event.key === "2") {
                setCameraState(CameraState.PEEK_DFR);
            }
            if (event.key === "3") {
                setCameraState(CameraState.PEEK_UFL);
            }
            if (event.key === "9") {
                setCameraState(CameraState.PEEK_UBL);
            }
            if (event.key === "0") {
                setCameraState(CameraState.PEEK_UBR);
            }
        }
        function upHandler () {
            setCameraState(CameraState.HOME);
        }
        window.addEventListener('keydown', downHandler);
        window.addEventListener('keyup', upHandler);
        return () => {
            window.removeEventListener('keydown', downHandler);
            window.removeEventListener('keyup', upHandler);
        };
    }, []);

    return <div
        ref={mount}
        style={{ width: props.width, height: props.height, zIndex: 1 }}
    />;
}

export default CubeSim
