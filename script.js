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

let radius = 0.3;

let c = [];
for (let t = 0; t < Math.PI * 2; t += 0.2) {
    c.push([0, radius*Math.sin(t), radius*Math.cos(t), 1]);
}

let transforms = [];
//    // [translate in x, rotation around z, scale]
//    [0.5, 0.4, 1],
//    [0.5, 0.4, 1],
//    [0.7, 0.4, 0.2],
//    [0.5, 0.4, 1],
//    [0.5, 0.4, 1]
//];

transforms.push([-1.5, 0, 1]);

let steps = 5;
for (let i = 0; i < steps; i ++ ){
    let x = i / steps;
    transforms.push([0.1, 1, 1]);
}

transforms.push([0.1, 0, 0]);

let base_segment = {'points': c, 'normals': c};
let segments = [
    //base_segment // don't start at origin, start at first transformation
];

function multiply_many(matrices) {
    // multiplies in left to right order, i.e. accumulator on right of current
    return matrices.reduce((acc,cur) => m4.multiply(cur, acc), m4.identity());
}

let m_rot = m4.identity();
let m_seg = m4.identity();
let cur_pos = [0, 0, 0];

for (let i = 0; i < transforms.length; i++){
    let trans = transforms[i][0];
    let rot = transforms[i][1];
    let scale = transforms[i][2];
    cur_pos = misc.add_vec(cur_pos, m4.apply(m_rot, [trans, 0, 0, 1]).slice(0,3));
    m_rot = m4.multiply(m4.rotation_z(rot), m_rot);
    // order of transformations (obvs reverse in source):
    // translate to origin, scale, rotate, translate back + extra trans
    let m_trans = multiply_many([
        m4.translation(trans, 0, 0),
        m4.rotation_z(rot),
        m4.translation(...cur_pos),
        m4.scale(scale),
        m4.translation(...misc.scale_vec(cur_pos, -1)),
    ]);

    // add this as last step to transforms
    m_seg = m4.multiply(m_trans, m_seg);
    console.log(cur_pos, m_rot, m_seg);
    segments.push({
        'points': base_segment['points'].map(v => m4.apply(m_seg, v)),
        'normals': base_segment['normals'].map(v => m4.apply(m_rot, v))
    });
}

function hull_segs(a, b) {
    // takes two segments of points and returns triangles and normals ready
    // for passing straight to webgl
    let positions = [];
    let normals = [];
    if (a['points'].length != a['normals'].length ||
          b['points'].length != b['normals'].length ||
          a['normals'].length != b['normals'].length)
        console.error('segments not same size!');
    for (let i = 0; i < a['points'].length; i++){
        let ni = i + 1 == a['points'].length ? 0 : i + 1;
        // verts is used to get the points and normals
        let verts = [
            [a, i], [a, ni], [b, i],
            [b, i], [a, ni], [b, ni]
        ];
        for (let v of verts) {
            positions.push(...v[0]['points'][v[1]].slice(0,3));
            normals.push(...v[0]['normals'][v[1]].slice(0,3));
        }
        // vs.push(a[i].slice(0,3), a[i+1].slice(0,3), b[i].slice(0,3));
        // vs.push(a[i+1].slice(0,3), b[i].slice(0,3), b[i+1].slice(0,3));

    }
    return [positions, normals];
}

//function hull_circles(a, b) {
//    let vs = [];
//    if (a.length != b.length) console.error('non equal circles');
//    for (let i = 0; i < a.length-1; i++) {
//        vs.push(a[i].slice(0,3), a[i+1].slice(0,3), b[i].slice(0,3));
//        vs.push(a[i+1].slice(0,3), b[i].slice(0,3), b[i+1].slice(0,3));
//    }
//    return vs
//}

let positions = [];
let normals = [];

for (let i = 0; i < segments.length - 1; i++){
    let faces = hull_segs(segments[i], segments[i+1]);
    positions.push(...faces[0]);
    normals.push(...faces[1]);
}

gl.bindBuffer(gl.ARRAY_BUFFER, positions_buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

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
    //transforms in front of cam's view
    let m_view = m4.multiply(m4.inverse(m4.orient(cam, [0,0,0])), m_rot);
    //maps 3d to 2d
    let m_world = m4.multiply(m_perspective, m_view);
    gl.uniformMatrix4fv(u_world_matrix_loc, false, m4.gl_format(m_world));
    gl.uniformMatrix4fv(u_view_matrix_loc, false, m4.gl_format(m_rot));
}

function update() {
    set_u_matrix();
    gl.uniform3fv(u_light_loc, new Float32Array(light));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);
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

canvas.addEventListener('wheel', e => {mouse_charge.magnitude += e.deltaY / 200});
//canvas.addEventListener('click', e => {charges.push({position: [...mouse_charge.position], magnitude: mouse_charge.magnitude})}); // unpacked so creates new object
