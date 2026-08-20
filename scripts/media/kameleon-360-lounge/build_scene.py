"""Build the Kameleon Decision Lounge 360 scene.

Run:
  blender --background --python build_scene.py -- [--calibrate] [--still] [--yaw R]

DESIGN
  The lounge is the WORLD, not a mesh. An equirectangular environment texture
  gives complete 360x180 coverage with no geometry, which means no seam to
  hide, no pole pinching and no normals to flip. The panorama is already
  seamless (verified 0.04x the interior baseline after feathering), so the
  projection is correct by construction.

  Only the brand is geometry: the approved bottle, its pedestal glow, and a
  dimensional KAMELEON sign. Those are the things that must be exact, and they
  are the things a generated image cannot be trusted with.

CYCLES, NOT EEVEE
  Panoramic cameras are a Cycles feature. EEVEE cannot render equirectangular
  at all, so this is not a quality preference.

ORIENTATION IS MEASURED, NOT ASSUMED
  Blender's mapping between world directions and equirectangular pixels is easy
  to get wrong by 90 or 180 degrees. --calibrate renders the world alone so the
  offset can be measured against the source panorama and written back, rather
  than guessed.
"""
import math
import os
import sys

import bpy

ROOT = r"C:\Users\cotye\Videos\Kameleon360Placeholders"
PANORAMA = os.path.join(ROOT, "kameleon-decision-lounge-placeholder-360.png")
BOTTLE = os.path.join(ROOT, "kameleon-bottle-cutout.png")

FPS = 30
DURATION_SECONDS = 15
FRAMES = FPS * DURATION_SECONDS          # 450
WIDTH, HEIGHT = 3840, 1920

# Kameleon tokens, linear-ish sRGB values.
COPPER = (0.753, 0.522, 0.322, 1.0)      # #c08552
COPPER_LIGHT = (0.890, 0.710, 0.514, 1.0)  # #e3b583
TEAL = (0.114, 0.353, 0.435, 1.0)        # label teal
DEEP_RED = (0.698, 0.227, 0.227, 1.0)    # #b23a3a

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
CALIBRATE = "--calibrate" in argv
STILL = "--still" in argv
# MEASURED, and defaulted rather than left to a flag.
#
# Blender's equirectangular camera puts world +Y at the image centre, but this
# panorama's hero pedestal is 270 degrees away from there, so an uncorrected
# render opens facing the BAR. That was measured with --calibrate and
# measure_yaw.py, which reported "render is rotated by 270.00 deg".
#
# It is a DEFAULT and not a flag because it was a flag, and the flag was
# forgotten: a 450-frame sequence rendered, encoded, uploaded and attached to
# 28 nodes before anyone looked at the delivered file and saw the bar. The
# correct value is a property of this panorama, not of one invocation.
#
# The value was fixed by measurement, not by reading it off measure_yaw.py,
# which had a sign flip and recommended -270. Rendering at 0 and at -270 and
# correlating each against the source gives rotation = 90 + YAW, so YAW = -90
# is the value that lands the pedestal dead ahead. Two data points beat one
# derivation.
YAW = -1.5707963267948966  # -90 degrees
if "--yaw" in argv:
    YAW = float(argv[argv.index("--yaw") + 1])


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_world():
    world = bpy.data.worlds.new("KameleonLounge")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")

    env.image = bpy.data.images.load(PANORAMA)
    # The panorama is a photograph of light, not data: it must be read as sRGB
    # or the whole lounge renders washed out.
    env.image.colorspace_settings.name = "sRGB"

    # NO Mapping node. Driving alignment through a Mapping node's Generated
    # coordinate did not rotate the environment one-for-one - a -270 degree
    # rotation moved the render by -90 - so the offset is applied to the CAMERA
    # instead, where a yaw of R rotates the render by exactly R.
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # 1.0 keeps the panorama at its authored exposure. The lounge is meant to
    # be dim; brightening it here would flatten the copper lighting the whole
    # look depends on.
    bg.inputs["Strength"].default_value = 1.0
    return bg


def build_camera():
    cam_data = bpy.data.cameras.new("Pano")
    cam_data.type = "PANO"
    # Blender 4.x/5.x moved panorama_type onto the camera data.
    if hasattr(cam_data, "panorama_type"):
        cam_data.panorama_type = "EQUIRECTANGULAR"
    else:  # older Cycles location
        cam_data.cycles.panorama_type = "EQUIRECTANGULAR"

    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    # Seated eye height in a lounge. The world is at infinity so this does not
    # move the background; it sets the parallax the bottle is seen with.
    cam.location = (0.0, 0.0, 1.15)
    # Upright, looking along +Y. The exact mapping to image columns is measured
    # by --calibrate rather than trusted.
    # YAW comes from measure_yaw.py, not from a guess about Blender's mapping.
    cam.rotation_euler = (math.radians(90), 0.0, YAW)
    bpy.context.scene.camera = cam
    return cam


def image_plane(name, path, height_m, location, rotation_z):
    """A camera-facing textured plane. Emission-lit so the bottle keeps the
    contrast of its own product lighting instead of being flattened by the
    lounge's dim ambient."""
    img = bpy.data.images.load(path)
    w_px, h_px = img.size
    width_m = height_m * (w_px / h_px)

    bpy.ops.mesh.primitive_plane_add(size=1.0, location=location)
    plane = bpy.context.object
    plane.name = name
    # Scale in the plane's OWN axes, before it is stood up. The first version
    # used (width, 1.0, height); after the 90-degree X rotation the third
    # component is the normal, so the height was applied to thin air and the
    # bottle rendered 1 m tall and 12 cm wide.
    plane.scale = (width_m, height_m, 1.0)
    # Stand it up, then yaw it to FACE the camera.
    #
    # The turn is -rotation_z, not rotation_z + pi. Both put the artwork the
    # right way round at rotation_z = +/-90 degrees, and only one of them does
    # so anywhere else - which is why the half turn survived: it was tuned at
    # 270 degrees, where it happens to agree.
    #
    # Working it through: after the 90-degree stand-up the plane's normal is
    # (sin t, -cos t) for a turn t, and the object sits at (sin r, cos r) * d,
    # so facing the camera at the origin needs (-sin r, -cos r). t = -r gives
    # exactly that for every r; t = r + pi gives (-sin r, +cos r), which is
    # correct only where cos r = 0. At r = 0 it points the artwork away and the
    # render reads NOELEMAK.
    plane.rotation_euler = (math.radians(90), 0.0, -rotation_z)

    mat = bpy.data.materials.new(f"{name}Mat")
    mat.use_nodes = True
    mat.blend_method = "BLEND"
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    emission = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")

    tex.image = img
    tex.image.colorspace_settings.name = "sRGB"
    tex.interpolation = "Cubic"

    emission.inputs["Strength"].default_value = 1.6

    nt.links.new(tex.outputs["Color"], emission.inputs["Color"])
    nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    nt.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emission.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    plane.data.materials.append(mat)
    return plane, emission


def shadow(location, radius):
    """A soft dark ellipse under the bottle.

    The lounge is a world texture, so there is no floor for Cycles to catch a
    shadow on - the bottle would read as pasted on regardless of lighting. A
    flat, radially faded dark disc at the dais surface gives the contact the
    eye is looking for."""
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=location)
    plane = bpy.context.object
    plane.name = "ContactShadow"
    plane.scale = (radius * 2.0, radius * 1.1, 1.0)

    mat = bpy.data.materials.new("ContactShadowMat")
    mat.use_nodes = True
    mat.blend_method = "BLEND"
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    dark = nt.nodes.new("ShaderNodeEmission")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    coord = nt.nodes.new("ShaderNodeTexCoord")

    grad.gradient_type = "SPHERICAL"
    # A spherical gradient is 1 at the centre and 0 at the rim, and Fac drives
    # the mix TOWARDS the dark shader. The first version had these two colours
    # the other way round, which made the whole disc opaque outside the middle
    # and rendered a hard black skirt under the bottle.
    ramp.color_ramp.elements[0].position = 0.05
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)   # rim  -> transparent
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)   # centre -> dark

    dark.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    dark.inputs["Strength"].default_value = 0.55

    nt.links.new(coord.outputs["Generated"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    nt.links.new(dark.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    plane.data.materials.append(mat)
    return plane


def build_wordmark(location, rotation_z, height_m):
    """KAMELEON as dimensional type, not as generated pixels.

    The brief is explicit that image-generation must not be trusted with the
    wordmark, and the only authoritative copy in the repository is curved
    around the bottle label at low resolution. Typesetting it keeps the
    spelling and proportions exact and lets it be lit like a real sign."""
    curve = bpy.data.curves.new("Wordmark", type="FONT")
    curve.body = "KAMELEON"
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = height_m
    curve.space_character = 1.1
    # Extruded so it catches light as an object rather than reading as a decal.
    curve.extrude = height_m * 0.06
    curve.bevel_depth = height_m * 0.012

    for candidate in (r"C:\Windows\Fonts\georgiab.ttf", r"C:\Windows\Fonts\georgia.ttf",
                      r"C:\Windows\Fonts\timesbd.ttf"):
        if os.path.exists(candidate):
            curve.font = bpy.data.fonts.load(candidate)
            break

    obj = bpy.data.objects.new("Wordmark", curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    # Same facing rule as the bottle, and for the same reason - see image_plane.
    obj.rotation_euler = (math.radians(90), 0.0, -rotation_z)

    mat = bpy.data.materials.new("WordmarkMat")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = COPPER
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.28
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = COPPER_LIGHT
        bsdf.inputs["Emission Strength"].default_value = 0.18
    obj.data.materials.append(mat)
    return obj, bsdf


def build_lights(forward_yaw):
    """Practical lighting on the hero only. The lounge carries its own light in
    the panorama; adding a key for it would double every shadow already baked
    into the image."""
    lights = []

    def area(name, loc, energy, color, size):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.color = color[:3]
        data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        bpy.context.collection.objects.link(obj)
        lights.append((obj, data))
        return data

    fx, fy = math.sin(forward_yaw), math.cos(forward_yaw)
    key = area("BottleKey", (fx * 2.4 + 0.5, fy * 2.4, 2.0), 60.0, COPPER_LIGHT, 1.2)
    rim = area("BottleRim", (fx * 3.4 - 0.6, fy * 3.4, 1.4), 45.0, TEAL, 0.9)
    ped = area("PedestalGlow", (fx * 2.9, fy * 2.9, 0.35), 30.0, COPPER, 0.7)
    return key, rim, ped


def animate(bottle_em, sign_bsdf, key, rim, ped):
    """Restrained, physical motion only.

    No camera movement: the visitor controls the view, and moving the camera in
    a 360 video is the fastest route to motion sickness. What moves is light -
    a slow chameleon shift between the label's copper and its teal, and a
    breathing pedestal glow."""
    scene = bpy.context.scene

    # Set BEFORE inserting: Blender 5.x removed Action.fcurves in favour of
    # slotted actions, so walking every curve afterwards to change easing is
    # both version-fragile and unnecessary.
    try:
        bpy.context.preferences.edit.keyframe_new_interpolation_type = "SINE"
    except Exception:
        pass

    def key_energy(light, frame, value):
        light.energy = value
        light.keyframe_insert("energy", frame=frame)

    def key_color(light, frame, value):
        light.color = value[:3]
        light.keyframe_insert("color", frame=frame)

    # One full, slow cycle across the clip, starting and ending identically so
    # the loop is clean if Stream ever loops it.
    mid = FRAMES // 2
    for frame, k, r, p in (
        (1, 60.0, 45.0, 30.0),
        (mid, 74.0, 30.0, 40.0),
        (FRAMES, 60.0, 45.0, 30.0),
    ):
        key_energy(key, frame, k)
        key_energy(rim, frame, r)
        key_energy(ped, frame, p)

    for frame, c in ((1, COPPER_LIGHT), (mid, TEAL), (FRAMES, COPPER_LIGHT)):
        key_color(rim, frame, c)

    for frame, s in ((1, 0.18), (mid, 0.34), (FRAMES, 0.18)):
        sign_bsdf.inputs["Emission Strength"].default_value = s
        sign_bsdf.inputs["Emission Strength"].keyframe_insert("default_value", frame=frame)

    for frame, s in ((1, 1.60), (mid, 1.78), (FRAMES, 1.60)):
        bottle_em.inputs["Strength"].default_value = s
        bottle_em.inputs["Strength"].keyframe_insert("default_value", frame=frame)



def _log(message):
    """stderr, not stdout: Blender's stdout is not captured by the shell
    redirection used to log the render, so a print() here is invisible in
    render.log - which is exactly how a silent CPU fallback went unnoticed."""
    sys.stderr.write("[kameleon] " + str(message) + chr(10))
    sys.stderr.flush()


def configure_render(still):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"

    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs:
        cp = prefs.preferences
        for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
            try:
                cp.compute_device_type = backend
                cp.get_devices()
                if any(d.type == backend for d in cp.devices):
                    for d in cp.devices:
                        d.use = d.type in (backend, "CPU")
                    _log(f"GPU backend: {backend} -> "
                         f"{[(d.name, d.type, d.use) for d in cp.devices if d.use]}")
                    break
            except Exception:
                continue
        else:
            scene.cycles.device = "CPU"
            _log("no GPU backend available, using CPU")

    # The world is emission and the hero is a lit plane: there is almost no
    # indirect light to resolve, so samples buy very little beyond denoising.
    scene.cycles.samples = 24 if not still else 48
    scene.cycles.use_denoising = True
    # The denoiser, not the ray tracing, was the whole cost. Cycles rendered a
    # 3840x1920 frame of this scene on the GPU almost instantly and then spent
    # ~11 seconds denoising it on the CPU - 30 cores saturated while the 4080
    # sat at 2%. OptiX denoises on the GPU, and on an emission-only scene at 24
    # samples there is almost nothing to denoise anyway.
    try:
        scene.cycles.denoiser = "OPTIX"
    except Exception:
        pass
    for attr in ("denoising_use_gpu", "use_denoising_gpu"):
        if hasattr(scene.cycles, attr):
            setattr(scene.cycles, attr, True)
    scene.cycles.max_bounces = 4
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False

    _log(f"device={scene.cycles.device} denoiser={getattr(scene.cycles, 'denoiser', '?')} "
         f"samples={scene.cycles.samples}")

    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.frame_start = 1
    # 450 frames at 30fps is exactly 15s. The last frame is NOT a duplicate of
    # the first; the light cycle returns to its starting value at frame 450.
    scene.frame_end = FRAMES

    # Resumable: a dropped connection or a reboot part way through 450 frames
    # must not mean starting again. Blender skips a frame whose file already
    # exists when use_overwrite is off, and the placeholder file stops a second
    # process claiming a frame this one is already working on.
    scene.render.use_overwrite = False
    scene.render.use_placeholder = True

    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 15
    scene.view_settings.view_transform = "Filmic" if "Filmic" in [
        v.name for v in scene.view_settings.bl_rna.properties["view_transform"].enum_items
    ] else "Standard"


def main():
    clear()
    build_world()
    cam = build_camera()
    configure_render(STILL or CALIBRATE)

    if CALIBRATE:
        scene = bpy.context.scene
        scene.render.resolution_x = 1024
        scene.render.resolution_y = 512
        scene.render.filepath = os.path.join(ROOT, "calibration", "world_")
        scene.frame_set(1)
        bpy.ops.render.render(write_still=True)
        print("[kameleon] calibration render written")
        return

    # Camera forward, taken from the matrix rather than assumed.
    #
    # The update() is not optional. Setting rotation_euler does not rebuild
    # matrix_world until the dependency graph runs, so reading it immediately
    # returns the IDENTITY - which put the hero bottle 90 degrees off centre,
    # as a thin sliver over by the bar, in the first render.
    bpy.context.view_layer.update()
    forward = cam.matrix_world.to_quaternion() @ __import__("mathutils").Vector((0.0, 0.0, -1.0))
    forward_yaw = math.atan2(forward.x, forward.y)
    print(f"[kameleon] camera forward yaw = {math.degrees(forward_yaw):.2f} deg")

    # The pedestal in the panorama sits at image centre, so the hero goes on
    # the camera's forward axis. Distance chosen so a 0.32 m bottle reads at a
    # believable size across a lounge.
    # Standing ON the dais, not hovering above it.
    #
    # The panorama has no geometry - it is the world at infinity - so "on the
    # dais" is an ANGLE, not a height. In the forward proof view the dais
    # surface sits about 260 px below centre at a 90-degree field, which is
    # atan(260/640) = 22.1 degrees down. The base height follows from that and
    # the chosen distance, so the bottle meets the surface instead of hovering
    # over it as it did in the first pass.
    DAIS_ANGLE = math.radians(-22.1)
    BOTTLE_H = 1.05          # a display bottle, the size a pedestal like this is built for
    dist = 2.30
    bx, by = math.sin(forward_yaw) * dist, math.cos(forward_yaw) * dist
    base_z = 1.15 + dist * math.tan(DAIS_ANGLE)

    shadow(( bx, by, base_z + 0.004), radius=BOTTLE_H * 0.20)

    bottle, bottle_em = image_plane(
        "KameleonBottle", BOTTLE, height_m=BOTTLE_H,
        location=(bx, by, base_z + BOTTLE_H / 2), rotation_z=forward_yaw,
    )

    # On the feature wall behind the dais, above the bottle's shoulder.
    sign_dist = 4.0
    sx, sy = math.sin(forward_yaw) * sign_dist, math.cos(forward_yaw) * sign_dist
    sign, sign_bsdf = build_wordmark((sx, sy, 1.95), forward_yaw, height_m=0.36)

    key, rim, ped = build_lights(forward_yaw)
    animate(bottle_em, sign_bsdf, key, rim, ped)

    blend_path = os.path.join(ROOT, "kameleon-decision-lounge-placeholder-360.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"[kameleon] saved {blend_path}")

    scene = bpy.context.scene
    if STILL:
        scene.render.filepath = os.path.join(ROOT, "proof", "hero_")
        scene.frame_set(1)
        bpy.ops.render.render(write_still=True)
        print("[kameleon] still written")
    else:
        scene.render.filepath = os.path.join(ROOT, "frames", "f_")
        bpy.ops.render.render(animation=True)
        print("[kameleon] frame sequence written")


main()
