'use strict';

/*
 * Good fundamental resource: https://webglfundamentals.org/
 * Shaders are defined as strings in the `shaders.js` script.
 *
 * Ultimately WebGL is a 2d rasterization (fills pixels from vector graphic)
 * library, but the Graphics Library Shader Language (GLSL) has features
 * that make writing 3d engines easier. This includes things like matrix
 * operations, dot products, and options like CULL_FACE and DEPTH (Z) BUFFER.
 */

// ensure this matches the vertex shader #define
const MAX_CHARGES = 50;

let canvas = document.getElementById('canvas');
let gl = canvas.getContext('webgl');
if (!gl) canvas.innerHTML = 'Oh no! WebGL is not supported.';

function fit_canvas_to_screen(){
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
fit_canvas_to_screen();
window.addEventListener('resize', fit_canvas_to_screen);

let program = misc.create_gl_program(vertex_shader_src, fragment_shader_src);
gl.useProgram(program);

//set the color we want to clear to
gl.clearColor(0.8, 0.8, 0.8, 1);

let a_position_loc = gl.getAttribLocation(program, 'a_position');
let a_normal_loc = gl.getAttribLocation(program, 'a_normal');
let u_world_matrix_loc = gl.getUniformLocation(program, 'u_world_matrix');
let u_view_matrix_loc = gl.getUniformLocation(program, 'u_view_matrix');
let u_light_loc = gl.getUniformLocation(program, 'u_light');

gl.enableVertexAttribArray(a_position_loc);
gl.enableVertexAttribArray(a_normal_loc);

let positions_buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positions_buffer);
gl.vertexAttribPointer(a_position_loc, 3, gl.FLOAT, false, 0, 0);

let normals_buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
gl.vertexAttribPointer(a_normal_loc, 3, gl.FLOAT, false, 0, 0);

function multiply_many(matrices) {
    // multiplies in left to right order, so that the first index is the
    // furthest left / last matrix. This means accumulator goes on left so
    // that first index ends up on the furthest left and identity ends up
    // on furthest left hand side ! This is definitely right - have tested
    return matrices.reduce((acc,cur) => m4.multiply(acc, cur), m4.identity());
}

function generate_tube(segment_shape, transforms){
    /*
     * Extrudes segment_shape according to transforms from origin into positive
     * z-direction.
     *
     * the normals of the segment shape are assumed to be going straight out
     * from the origin to each vertex
     * arguments:
     * segment_shape - an array of 2d XY points to describe shape of segment
     * transforms - an array of [step, [rx, ry, rx], scale] transformations
     */

    let base_segment = {
        'points': segment_shape.map(v => [v[0], v[1], 0, 1]),
        'normals': segment_shape.map(v => [v[0], v[1], 0, 1])
    }
    let segments = [
        base_segment
    ];

    let cur_pos = [0, 0, 0];

    // the current seg rotation for normals and step
    let m_rot = m4.identity();
    // the current seg scale - will be comined with rotation to get new segment
    let m_scale = m4.identity();

    for (let transform of transforms) {
        let step = transform[0];
        let rotations = transform[1];
        let scale = transform[2];

        // calculate new face orientation (rotations and scales)
        // remember source code inreverse order to application
        m_rot = multiply_many([
            m4.rotation_z(rotations[2]),
            m4.rotation_y(rotations[1]),
            m4.rotation_x(rotations[0]),
            m_rot
        ]);
        m_scale = m4.multiply(m4.scale(scale), m_scale);
        // update the current position by adding the rotated z-direction step
        cur_pos = misc.add_vec(
            cur_pos,
            m4.apply(m_rot, [0, 0, step, 1]).slice(0,3)
        );
        // to transform base segment, rotate and scale then translate to cur pos
        // remember that the source code is in reverse order to application
        let m_seg = multiply_many([
            m4.translation(...cur_pos),
            m_scale,
            m_rot,
        ]);
        segments.push({
            'points': base_segment['points'].map(v => m4.apply(m_seg, v)),
            'normals': base_segment['normals'].map(v => m4.apply(m_rot, v))
        });
    }

    function hull_segs(a, b) {
        /* takes two segments and returns facets (triangles and
         * normals) note that the points and normals are 4d
         */
        let points = [];
        let normals = [];
        if (a['points'].length != a['normals'].length ||
              b['points'].length != b['normals'].length ||
              a['normals'].length != b['normals'].length)
            console.error('segments not same size!');
        for (let i = 0; i < a['points'].length; i++){
            let ni = i + 1 == a['points'].length ? 0 : i + 1;
            // verts describes two triangles to connect this index around the
            // segment to the next segment (i to ni)
            let verts = [
                [a, i], [a, ni], [b, i],
                [b, i], [a, ni], [b, ni]
            ];
            for (let v of verts) {
                points.push(v[0]['points'][v[1]]);
                normals.push(v[0]['normals'][v[1]]);
            }
        }
        return {
            'points': points,
            'normals': normals
        }
    }

    let facets = {
        'points': [],
        'normals': []
    }

    for (let i = 0; i < segments.length - 1; i++){
        let hulled = hull_segs(segments[i], segments[i+1]);
        facets['points'].push(...hulled['points']);
        facets['normals'].push(...hulled['normals']);
    }

    return facets
}

let c = [
    [  0.3 ,   0.3 ],
    [  0.6 ,  -0.2 ],
    [  0.2 ,  -0.5 ],
    [ -0.2 ,  -0.5 ],
    [ -0.6 ,  -0.2 ],
    [ -0.3 ,   0.3 ],
];

let seg_transforms = [];

function generate_tail_transforms(t) {
    let tail_length = 8;
    let num_segs = 10;
    let segs = [];
    for (let i = 0; i < num_segs; i++) {
        let x  = i / num_segs;
        segs.push([
            tail_length / num_segs,
            // ASJUST THESE PARAMETERS for different tail-wagging
            [
                Math.sin(t + 6 * x) / 20,
                Math.sin(2 * t + x) / 35,
                0
            ],
            0.92
        ]);
    }
    segs.push([0.4, [0, 0, 0], 0]);
    return segs;
}

function update_seg_transforms () {
    seg_transforms = generate_tail_transforms(time_ms / 500);
}

function flatten_4d(array) {
    if (array.some(x => x[3] != 1)) console.error('told to flatten when w not 1', array);
    return array.map(v => v.slice(0,3)).flat();
}

function populate_buffers() {
    let positions = [];
    let normals = [];

    let tail = generate_tube(c, seg_transforms);
    positions.push(...flatten_4d(tail['points']));
    normals.push(...flatten_4d(tail['normals']));

    gl.bindBuffer(gl.ARRAY_BUFFER, positions_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    //return number of triangles
    if (positions.length != normals.length) console.error('normals and positions different lengths');
    return positions.length / 3;
}

//clockwise triangles are back-facing, counter-clockwise are front-facing
//switch two verticies to easily flip direction a triangle is facing
//"cull face" feature means kill (don't render) back-facing triangles
//gl.enable(gl.CULL_FACE);

//enable the z-buffer (only drawn if z component LESS than that already there)
gl.enable(gl.DEPTH_TEST);

function perspective_mat(fov, aspect, near, far){
    return [
        [ 1/(aspect*Math.tan(fov/2)),                 0,                     0,                     0],
        [                          0, 1/Math.tan(fov/2),                     0,                     0],
        [                          0,                 0, (far+near)/(far-near), 2*near*far/(near-far)],
        [                          0,                 0,                     1,                     0]
    ];
}

let fov = misc.deg_to_rad(50);
let near = 0.1; //closest z-coordinate to be rendered
let far = 50; //furthest z-coordianted to be rendered
let m_perspective;

function calculate_perspective_matrix() {
    // put in function so can call again on canvas re-size when aspect changes
    let aspect = canvas.width/canvas.height;
    m_perspective = perspective_mat(fov, aspect, near, far);
}
calculate_perspective_matrix();
window.addEventListener('resize', calculate_perspective_matrix);

let space_yaw = 0;
let space_pitch = 0;

let cam = [0, 1.5, -5]; // issues when cam is up x-axis with panning of space_pitch !!

let light = [-1, -1, 1]; // normalised in vertex shader

function set_u_matrix(){
    // matrices in right-to-left order (i.e. in order of application)

    // rotates space according to space_yaw and space_pitch
    let m_rot = m4.multiply(m4.rotation_x(space_pitch), m4.rotation_y(space_yaw));
    // transforms in front of cam's view
    let m_view = m4.multiply(m4.inverse(m4.orient(cam, [0,0,0])), m_rot);
    //maps 3d to 2d
    let m_world = m4.multiply(m_perspective, m_view);
    gl.uniformMatrix4fv(u_world_matrix_loc, false, m4.gl_format(m_world));
    gl.uniformMatrix4fv(u_view_matrix_loc, false, m4.gl_format(m_rot));
}

let time_ms;
let last_time;
let time_delta;

function update(time) {
    time_ms = time; // assign to global
    time_delta = last_time ? time_ms - last_time : 10000;
    last_time = time_ms;

    update_seg_transforms();
    let num_triangles = populate_buffers();

    set_u_matrix();
    gl.uniform3fv(u_light_loc, new Float32Array(light));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, num_triangles);
    requestAnimationFrame(update);
}

update();

function toclipspace(x, y) {
    return [
        (x / canvas.width) * 2 - 1,
        -((y / canvas.height) * 2 - 1),
    ];
}

canvas.addEventListener('mousemove', function(e) {
    let sensitivity = 400;
    // if right click held down, so panning
    if (e.buttons & 1) {
        space_yaw -= e.movementX / sensitivity;
        space_pitch -= e.movementY / sensitivity;
        if (space_pitch > Math.PI/2) space_pitch = Math.PI / 2;
        if (space_pitch < -Math.PI/2) space_pitch = -Math.PI / 2;
    }
});

canvas.addEventListener('wheel', e => {cam = misc.scale_vec(cam, 1 + e.deltaY / 200);});
//canvas.addEventListener('click', e => {charges.push({position: [...mouse_charge.position], magnitude: mouse_charge.magnitude})}); // unpacked so creates new object
