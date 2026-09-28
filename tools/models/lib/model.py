"""
A monster model in Blender: sculpted parts (lib/sdf.py) hung on pivots, finished (smoothed,
reduced, coloured, ambient occlusion baked in) and exported as one .glb.

What the game reads from it (client/src/cave/handmade/glb-model.ts):
- node names: pivots `body`, `foot_L`/`foot_R`, `arm_L`/`arm_R`, `tail`, `wing_L`/`wing_R`,
  `head`, and an empty `seat` where a rider sits;
- each mesh's custom properties (glTF extras → userData): `role` ("toon": lit like every
  monster, outlined; "flat": a flat colour, like eyes and cheeks), `outline` (0 = none),
  `opacity`, `face` ("open" eyes, "shut" eyelids, "smile", "talk" mouth), `minStage` /
  `maxStage` (shown only at those evolution stages), `stageShade` (darker at later stages);
- vertex colours: RGB is the part's palette colour (so the game can recolour rare variants
  exactly), alpha is the baked ambient occlusion (1 = open, less in creases).

Model units: 1 = the 128-px picture box; the origin is the box's middle; the face looks
along −y in Blender (+z in glTF).
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from .sdf import PX

V = Vector


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    world = bpy.data.worlds.new("world")
    scene.world = world
    world.light_settings.distance = 12 * PX  # how far ambient occlusion looks


def P(x, f, z):
    """A point in model units from picture px: x right, f towards the viewer, z up (from the box's middle)."""
    return V((x * PX, -f * PX, z * PX))


def S(x, f, z):
    """The same point in px, in Blender's axes (for sculpting)."""
    return V((x, -f, z))


def apply_modifiers(obj):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear()
    old = obj.data
    obj.data = me
    bpy.data.meshes.remove(old)


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


class Part:
    def __init__(self, obj, sculpt, props, budget, smooth):
        self.obj, self.sculpt, self.props, self.budget, self.smooth = obj, sculpt, props, budget, smooth


class Model:
    def __init__(self, name):
        reset()
        self.name = name
        self.root = self.empty(name, V((0, 0, 0)))
        self.parts = []
        self.pivots = {}

    def empty(self, name, at, parent=None, rotation=(0, 0, 0)):
        e = bpy.data.objects.new(name, None)
        e.location = at
        e.rotation_euler = rotation
        bpy.context.scene.collection.objects.link(e)
        if parent is not None:
            e.parent = parent
        bpy.context.view_layer.update()
        return e

    def pivot(self, name, at, parent=None, rotation=(0, 0, 0)):
        """A named pivot (see the module's notes) at a point in model units."""
        e = self.empty(name, at, parent or self.root, rotation)
        # Children added later keep their world placement.
        e.matrix_parent_inverse = (parent or self.root).matrix_world.inverted()
        bpy.context.view_layer.update()
        self.pivots[name] = e
        return e

    def part(self, sculpt, name, parent=None, voxel=0.8, budget=2000, smooth=2, role="toon", outline=True,
             opacity=1.0, face=None, stages=(1, 3), stage_shade=False):
        obj = sculpt.mesh(name, voxel)
        props = {"role": role}
        if not outline or role == "flat":
            props["outline"] = 0
        if opacity < 1:
            props["opacity"] = opacity
            if role == "toon":
                props["outline"] = 0
        if face:
            props["face"] = face
        if stages != (1, 3):
            props["minStage"], props["maxStage"] = stages
        if stage_shade:
            props["stageShade"] = 1
        part = Part(obj, sculpt, props, budget, smooth)
        part.parent = parent or self.root
        self.parts.append(part)
        return obj

    # --- where things sit on a surface (for the face)

    def surface(self, obj, x, z, back=False, down=False):
        """
        Where a ray meets `obj`: from the front at picture px (x, z), from behind (`back`), or
        from above at (x, f = z) (`down`). Point and normal, model units.
        """
        bpy.context.view_layer.update()
        if down:
            origin, direction = P(x, z, 100), V((0, 0, -1))
        elif back:
            origin, direction = P(x, -100, z), V((0, -1, 0))
        else:
            origin, direction = P(x, 100, z), V((0, 1, 0))
        hit, loc, normal, _ = obj.ray_cast(origin, direction)
        if not hit:
            raise RuntimeError(f"nothing at x={x} z={z} on {obj.name}")
        return loc, normal.normalized()

    def tangent_frame(self, normal, roll=0.0):
        """Axes on a surface: right, up (as near world up as the surface allows) and out (the normal)."""
        n = V(normal)
        up = V((0, 0, 1))
        right = up.cross(n).normalized() if abs(n.dot(up)) < 0.99 else V((1, 0, 0))
        up2 = n.cross(right).normalized()
        if roll:
            q = Matrix.Rotation(roll, 3, n)
            right, up2 = q @ right, q @ up2
        return right, up2, n

    # --- finishing

    def finish(self):
        for part in self.parts:
            obj = part.obj
            if part.smooth:
                sm = obj.modifiers.new("smooth", "CORRECTIVE_SMOOTH")
                sm.iterations = part.smooth
                sm.smooth_type = "SIMPLE"
                sm.use_only_smooth = True
                apply_modifiers(obj)
            count = tris(obj)
            if count > part.budget:
                d = obj.modifiers.new("dec", "DECIMATE")
                d.ratio = part.budget / count
                d.use_collapse_triangulate = True
                apply_modifiers(obj)
            obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
            obj.data.update()
            for k, v in part.props.items():
                obj[k] = v
        self._colour_and_bake()
        for part in self.parts:
            obj = part.obj
            obj.parent = part.parent
            obj.matrix_parent_inverse = part.parent.matrix_world.inverted()
        bpy.context.view_layer.update()

    def _stage_visible(self, part, stage):
        lo, hi = part.props.get("minStage", 1), part.props.get("maxStage", 3)
        return lo <= stage <= hi

    def _colour_and_bake(self):
        scene = bpy.context.scene
        scene.cycles.samples = 256
        scene.render.bake.target = "VERTEX_COLORS"
        scene.render.bake.use_selected_to_active = False
        mat = bpy.data.materials.new("bake")
        mat.use_nodes = True
        for part in self.parts:
            me = part.obj.data
            for a in list(me.color_attributes):
                me.color_attributes.remove(a)
            if not me.materials:
                me.materials.append(mat)
        for part in self.parts:
            obj, me = part.obj, part.obj.data
            colours = part.sculpt.colours(obj)
            ao = np.ones(len(me.vertices))
            if part.props["role"] == "toon":
                # Occluded by the other lit parts of the same stage (not the face's flat bits).
                stage = part.props.get("minStage", 1)
                for other in self.parts:
                    other.obj.hide_render = not (other.props["role"] == "toon" and self._stage_visible(other, stage))
                obj.hide_render = False
                tmp = me.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
                me.color_attributes.active_color = tmp
                for o in bpy.context.scene.objects:
                    o.select_set(False)
                obj.select_set(True)
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.bake(type="AO")
                ao = np.array([d.color[0] for d in tmp.data])
                ao = self._smooth(obj, ao, 3)
                me.color_attributes.remove(tmp)
            col = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
            me.color_attributes.active_color = col
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
            for i, d in enumerate(col.data):
                c = int(colours[i])
                # BYTE_COLOR takes linear values and stores them as sRGB bytes: hand it the palette colour in linear.
                d.color = (_lin((c >> 16) & 255), _lin((c >> 8) & 255), _lin(c & 255), float(max(0.0, min(1.0, ao[i]))))
        for part in self.parts:
            part.obj.hide_render = False

    @staticmethod
    def _smooth(obj, values, n):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        for _ in range(n):
            values = np.array([
                (values[v.index] + sum(values[e.other_vert(v).index] for e in v.link_edges)) / (1 + len(v.link_edges))
                for v in bm.verts
            ])
        bm.free()
        return values

    # --- output

    def export(self, path):
        for o in bpy.context.scene.objects:
            o.select_set(False)
        for o in [self.root, *self.root.children_recursive]:
            o.select_set(True)
        bpy.context.view_layer.objects.active = self.root
        kwargs = dict(
            filepath=str(path),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_normals=True,
            export_texcoords=False,
            export_extras=True,
            export_materials="NONE",
        )
        try:
            bpy.ops.export_scene.gltf(**kwargs, export_vertex_color="ACTIVE")
        except TypeError:
            bpy.ops.export_scene.gltf(**kwargs, export_colors=True)

    def stats(self):
        return {"tris": sum(tris(p.obj) for p in self.parts), "parts": len(self.parts)}

    def preview(self, path, stage=1, turn=-0.42, face="open"):
        """A quick Cycles picture (colours × baked AO, soft studio light) to look the sculpt over."""
        scene = bpy.context.scene
        mat = bpy.data.materials.new("preview")
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        bsdf.inputs["Roughness"].default_value = 0.6
        attr = nt.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(attr.outputs["Color"], mul.inputs[6])
        comb = nt.nodes.new("ShaderNodeCombineColor")
        for k in range(3):
            nt.links.new(attr.outputs["Alpha"], comb.inputs[k])
        nt.links.new(comb.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        hidden = []
        for part in self.parts:
            part.obj.data.materials.clear()
            part.obj.data.materials.append(mat)
            f = part.props.get("face")
            show = self._stage_visible(part, stage) and (
                f is None or (f == "open" and face != "blink") or (f == "shut" and face == "blink")
                or (f == "smile" and face != "talk") or (f == "talk" and face == "talk"))
            part.obj.hide_render = not show
            hidden.append(part.obj)
        self.root.rotation_euler = (0, 0, -turn)
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        scene.collection.objects.link(cam)
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = 1.15
        cam.location = V((0, -3, 0.25))
        cam.rotation_euler = (math.radians(85), 0, 0)
        scene.camera = cam
        for loc, energy, size in (((-1.5, -2.0, 2.2), 120, 1.5), ((2.0, -1.0, 0.6), 40, 2.0), ((0.4, 2.0, 1.5), 60, 1.0)):
            light = bpy.data.objects.new("light", bpy.data.lights.new("light", "AREA"))
            scene.collection.objects.link(light)
            light.data.energy = energy
            light.data.size = size
            light.location = loc
            light.rotation_euler = (V((0, 0, 0)) - V(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.world.use_nodes = True
        bg = scene.world.node_tree.nodes["Background"]
        bg.inputs["Color"].default_value = (0.12, 0.12, 0.16, 1)
        bg.inputs["Strength"].default_value = 1.0
        scene.render.resolution_x = scene.render.resolution_y = 512
        scene.render.film_transparent = False
        scene.cycles.use_denoising = False
        scene.cycles.samples = 48
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        self.root.rotation_euler = (0, 0, 0)
        for o in hidden:
            o.hide_render = False
        bpy.data.objects.remove(cam)


def _lin(byte):
    c = byte / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
