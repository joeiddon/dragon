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
let u_rot_matrix_loc = gl.getUniformLocation(program, 'u_rot_matrix');
let u_view_matrix_loc = gl.getUniformLocation(program, 'u_view_matrix');
let u_light_loc = gl.getUniformLocation(program, 'u_light');
let a_texcoord_loc = gl.getAttribLocation(program, 'a_texcoord');

gl.enableVertexAttribArray(a_position_loc);
gl.enableVertexAttribArray(a_normal_loc);
gl.enableVertexAttribArray(a_texcoord_loc);

let positions_buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positions_buffer);
gl.vertexAttribPointer(a_position_loc, 3, gl.FLOAT, false, 0, 0);

let normals_buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
gl.vertexAttribPointer(a_normal_loc, 3, gl.FLOAT, false, 0, 0);

let texcoords_buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texcoords_buffer);
gl.vertexAttribPointer(a_texcoord_loc, 2, gl.FLOAT, false, 0, 0);

let texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
// fill with a blue pixel whilst wait for texture atlas image to load
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
              new Uint8Array([0, 0, 255, 255]));
let image = document.getElementById('texture-img');//new Image();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
gl.generateMipmap(gl.TEXTURE_2D);

let textures = {
    // format of values: [min corner, max corner] - from top left of image
    // that bottom left corner of texture is [0, 0]
    // weird black lines using texture atlas at boundaries - so this hack trims
    // edges a little - maybe to do with anti-alisaing ?
    'terrain': [[0.001, 0.001], [0.4999, 0.4999]],
    //'scales': [[0, 0.375], [0.5, 0.5]]
    //'terrain': [[0,0], [1, 1]],
    'scales': [[0.001, 0.4999], [0.125, 0.625]],
    'gradient': [[0.4999, 0.001], [0.7499, 0.2499]],
    'raspberry_scales': [[0.5001, 0.5001], [0.999, 0.999]]
}

function get_texcoord(texture, coord) {
    let min_x = textures[texture][0][0];
    let min_y = textures[texture][0][1];
    let max_x = textures[texture][1][0];
    let max_y = textures[texture][1][1];
    // wrap around at positive end before mapping to atlas
    if (coord[0] > 1) coord[0] %= 1;
    if (coord[1] > 1) coord[1] %= 1;
    return [
        min_x + coord[0] * (max_x - min_x),
        min_y + coord[1] * (max_y - min_y)
    ];
}

function gh(x,y) {
    // get height at x,y
    return 2.5 * perlin.get(x,y) + perlin.get(4*x, 4*y) / 5;
}

function calculate_normal(x,y) {
    /* un-normalised - shader can take care of that! */
    let delta = 0.0001;
    let h = gh(x,y);
    let c =  misc.cross(
        misc.sub_vec([x, gh(x,y+delta), y+delta], [x, h, y]),
        misc.sub_vec([x+delta, gh(x+delta,y), y], [x, h, y]),
    );
    return [c[1], c[0], c[2]];
}

var chunk_memory = {}

function gen_terrain_chunk(chunk_x, chunk_y) {
    /* generates a unit chunk translated to chunk_x, chunk_y*/
    if (chunk_memory.hasOwnProperty([chunk_x, chunk_y]))
        return chunk_memory[[chunk_x, chunk_y]];
    let points = [];
    let normals = [];
    let texpoints = [];

    let divs = 5;
    // d is interval / step
    let d = 1 / divs;
    for (let xx = 0; xx < divs; xx++){
        for (let yy = 0; yy < divs; yy++){
            let x = xx / divs + chunk_x;
            let y = yy / divs + chunk_y;
            // remember y and z flipped in 3d
            points.push([x, gh(x,y), y]);
            points.push([x+d, gh(x+d,y), y]);
            points.push([x+d, gh(x+d,y+d), y+d]);
            points.push([x, gh(x,y), y]);
            points.push([x, gh(x,y+d), y+d]);
            points.push([x+d, gh(x+d,y+d), y+d]);
            // use this code for per-triangle normals ...
            //let n1 = misc.cross(
            //    misc.sub_vec([x+d, gh(x+d,y+d), y+d], [x+d, gh(x+d,y), y]),
            //    misc.sub_vec([x+d, gh(x+d,y+d), y+d], [x, gh(x,y), y]),
            //);
            //normals.push(n1);
            //normals.push(n1);
            //normals.push(n1);
            //let n2 = misc.cross(
            //    misc.sub_vec([x+d, gh(x+d,y+d), y+d], [x, gh(x,y), y]),
            //    misc.sub_vec([x+d, gh(x+d,y+d), y+d], [x, gh(x,y+d), y+d]),
            //);
            //normals.push(n2);
            //normals.push(n2);
            //normals.push(n2);
            // per vertex normals ...
            normals.push(calculate_normal(x, y));
            normals.push(calculate_normal(x+d, y));
            normals.push(calculate_normal(x+d, y+d));
            normals.push(calculate_normal(x, y));
            normals.push(calculate_normal(x, y+d));
            normals.push(calculate_normal(x+d, y+d));

            // texture scale
            let ts = 1;
            texpoints.push(get_texcoord('terrain', [ts * (xx/divs), ts * (yy/divs)]));
            texpoints.push(get_texcoord('terrain', [ts * (xx/divs+d), ts * (yy/divs)]));
            texpoints.push(get_texcoord('terrain', [ts * (xx/divs+d), ts * (yy/divs+d)]));
            texpoints.push(get_texcoord('terrain', [ts * (xx/divs), ts * (yy/divs)]));
            texpoints.push(get_texcoord('terrain', [ts * (xx/divs), ts * (yy/divs+d)]));
            texpoints.push(get_texcoord('terrain', [ts * (xx/divs+d), ts * (yy/divs+d)]));
            //texpoints.push([0,0]);
            //texpoints.push([0.5,0]);
            //texpoints.push([0.5,0.5]);
            //texpoints.push([0,0]);
            //texpoints.push([0,0.5]);
            //texpoints.push([0.5,0.5]);
        }
    }
    let chunk = {
        'positions': new Float32Array(points.flat()),
        'normals': new Float32Array(normals.flat()),
        'texcoords': new Float32Array(texpoints.flat()),
        'num-points': points.length
    };
    chunk_memory[[chunk_x, chunk_y]] = chunk;
    return chunk;
}

//translation of surrounding chunks in dragon yaw direction so more is in FOV
//and less behind the camera
let CHUNK_VIEW_TRANS = 3;

function gen_terrain() {
    let chunks = [];
    for (let x = -4; x < 4; x ++){
        for (let y = -4; y < 4; y ++){
            let chunk = gen_terrain_chunk(
                x + parseInt(dragon_position[0] + Math.sin(dragon_direction.yaw)*CHUNK_VIEW_TRANS),
                y + parseInt(dragon_position[2] + Math.cos(dragon_direction.yaw)*CHUNK_VIEW_TRANS)
            );
            chunks.push(chunk);
        }
    }
    return chunks;
}

function flatten_4d(array) {
    if (array.some(x => x[3] != 1)) console.error('told to flatten when w not 1', array);
    return array.map(v => v.slice(0,3)).flat();
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

let fov = misc.deg_to_rad(70);
let near = 0.001; //closest z-coordinate to be rendered
let far = 100; //furthest z-coordianted to be rendered
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

let dragon_position = [0, 3, 0];
let dragon_direction = {'yaw': 0, 'pitch': 0};

let light = [-1, -1, 1]; // normalised in vertex shader

function set_u_matrix(){
    // matrices in right-to-left order (i.e. in order of application)

    // rotates space according to space_yaw and space_pitch
    let m_rot = m4.identity(); //multiply(m4.rotation_x(space_pitch), m4.rotation_y(space_yaw));
    // transforms in front of cam's view
    let m_view = m4.multiply(m4.inverse(m4.orient(cam, dragon_position)), m_rot);
    //maps 3d to 2d
    let m_world = m4.multiply(m_perspective, m_view);
    gl.uniformMatrix4fv(u_world_matrix_loc, false, m4.gl_format(m_world));
    gl.uniformMatrix4fv(u_rot_matrix_loc, false, m4.gl_format(m_rot));
    gl.uniformMatrix4fv(u_view_matrix_loc, false, m4.gl_format(m_view));
}

let time_ms; // declared earlier for a hack
let last_time;
let time_delta;

let dist = 0.15;

// units are completely messed up
let GLIDE_SPD = 0.7;
let DAMPENING_INCR = 0.5;
let DIVE_OR_CLIMB_INCR = 2;
let MIN_SPD = 0.5;
let MAX_SPD = 50;
let spd = GLIDE_SPD;
let min_fly_height = 0.05;

let yaw_speed = 0;

var flap_freq = 2;
var flap_phase = 0;
function set_flap_freq(new_flap_freq) {
    new_flap_freq /= 500; // make numbers more manageable
    flap_phase = flap_freq * time_ms + flap_phase - new_flap_freq * time_ms;
    flap_phase %= 2 * Math.PI;
    flap_freq = new_flap_freq;
}

let fpv = true;

function update(time) {
    time_ms = time; // assign to global
    if (!last_time){
        last_time = time_ms;
        requestAnimationFrame(update);
        return;
    }
    time_delta = (time_ms - last_time) / 1000;
    last_time = time_ms;

    dragon_direction.yaw += yaw_speed * time_delta;

    let dragon_direction_vect = [
        Math.cos(dragon_direction.pitch) * Math.sin(dragon_direction.yaw),
        Math.sin(dragon_direction.pitch),
        Math.cos(dragon_direction.pitch) * Math.cos(dragon_direction.yaw)
    ];

    let this_spd = spd;
    if (Math.abs(dragon_direction_vect[1]) < 0.4) {
        // if not diving or climbing, step towards gliding speed
        if (Math.abs(spd - GLIDE_SPD) > DAMPENING_INCR * time_delta) {
            spd += (spd < 0.7 ? 1 : -1) * DAMPENING_INCR * time_delta;
        } else {
            spd = GLIDE_SPD;
        }
    } else {
        //gliding or climbing, so adjust speed according to angle
        if (spd < MIN_SPD) spd = MIN_SPD;
        if (spd > MAX_SPD) spd = MAX_SPD;
        if (spd > MIN_SPD && spd < MAX_SPD)
        spd += -(dragon_direction_vect[1] ** 3) * DIVE_OR_CLIMB_INCR * time_delta
    }
    //if (spd < 0.3) spd = 0.3;
    //if (dragon_direction_vect[1] < -0.4) {
    //    spd += 0.04;
    //    this_spd = spd * 1.2 * (1 - dragon_direction_vect[1]);
    //    //set_flap_freq(0.5);
    //}// else if (dragon_direction_vect[1] > 0.4) {
    //    this_spd = spd;
    //    //set_flap_freq(6);
    //}
    set_flap_freq(5 * (dragon_direction_vect[1] + 1)**2); // - how not make this jumpy ??

    dragon_position = misc.add_vec(
        dragon_position,
        misc.scale_vec(dragon_direction_vect, this_spd * time_delta)
    );

    if (gh(dragon_position[0], dragon_position[2]) > dragon_position[1] - min_fly_height)
        dragon_position[1] = gh(dragon_position[0], dragon_position[2]) + min_fly_height;

    cam = misc.sub_vec(
        dragon_position,
        fpv ? misc.scale_vec(dragon_direction_vect, dist) :
        [0, -0.5, 0.5]
    );

    set_u_matrix();
    gl.uniform3fv(u_light_loc, new Float32Array(light));

    gl.clear(gl.COLOR_BUFFER_BIT);

    /** draw terrain */

    let chunks = gen_terrain();

    for (let chunk of chunks) {
        gl.bindBuffer(gl.ARRAY_BUFFER, positions_buffer);
        gl.bufferData(gl.ARRAY_BUFFER, chunk['positions'], gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
        gl.bufferData(gl.ARRAY_BUFFER, chunk['normals'], gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, texcoords_buffer);
        gl.bufferData(gl.ARRAY_BUFFER, chunk['texcoords'], gl.STATIC_DRAW);

        gl.drawArrays(gl.TRIANGLES, 0, chunk['num-points']);
    }

    /* draw draongs */

    let k = 0.007;
    let m_scale = [
        [k, 0, 0, 0],
        [0, k, 0, 0],
        [0, 0, k, 0],
        [0, 0, 0, 1]
    ];
    let m_dragon_rot = multiply_many([
        m4.rotation_y(dragon_direction.yaw),
        m4.rotation_x(-dragon_direction.pitch * 1.15), // tilt a bit more so can really see
        m4.rotation_z(-yaw_speed / 3)
    ]);
    let m_dragon_all = multiply_many([
        m4.translation(...dragon_position),
        m_dragon_rot,
        m_scale
    ]);
    let dragon = form_dragon(time_ms); // just forming dragon reduces fps by ~10w
    //make dragon smaller
    dragon = transform_facets(dragon, m_dragon_all, m_dragon_rot);

    let positions = flatten_4d(dragon['points']);
    let normals = flatten_4d(dragon['normals']);
    let texcoords = dragon['texpoints'].flat();

    gl.bindBuffer(gl.ARRAY_BUFFER, positions_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, texcoords_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);

    //return number of triangles
    if (positions.length != normals.length) console.error('normals and positions different lengths');

    gl.drawArrays(gl.TRIANGLES, 0, dragon['points'].length);

    draw_stats();
    requestAnimationFrame(update);
}

requestAnimationFrame(update);

function toclipspace(x, y) {
    return [
        (x / canvas.width) * 2 - 1,
        -((y / canvas.height) * 2 - 1),
    ];
}

document.addEventListener('mousemove', function(e) {
    let sensitivity = 150;
    // if right click held down, so panning
    //if (e.buttons & 1) {
        yaw_speed = (e.x / canvas.width - 0.5) * 10;
        if (yaw_speed > 5) yaw_speed = 5;
        if (yaw_speed < -5) yaw_speed = -5;
        dragon_direction.pitch = -(e.y / canvas.height - 0.5) * 3;
        if (dragon_direction.pitch > Math.PI / 2) dragon_direction.pitch = Math.PI / 2;
        if (dragon_direction.pitch < -Math.PI / 2) dragon_direction.pitch = -Math.PI / 2;
    //}
});

document.addEventListener('wheel', e => {dist *= 1 + e.deltaY / 200;});
document.addEventListener('click', e => {fpv = !fpv;});

let fps = 0;
function draw_stats() {
    fps = 0.9 * fps + 0.1 * (1 / time_delta);
    document.getElementById('stats').innerText =
`spd = ${spd.toFixed(2)}
fps = ${parseInt(fps)}`;
}
