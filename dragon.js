'use strict';

/*
 * provides function form_dragon(time_ms)
 */

function multiply_many(matrices) {
    // multiplies in left to right order, so that the first index is the
    // furthest left / last matrix. This means accumulator goes on left so
    // that first index ends up on the furthest left and identity ends up
    // on furthest left hand side ! This is definitely right - have tested
    return matrices.reduce((acc,cur) => m4.multiply(acc, cur), m4.identity());
}

function generate_tube(segment_shape, transforms, straight_down_matrix){
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
        'normals': segment_shape.map(v => [v[0], v[1], 0, 1]),
        'position_on_tube': 0
    }
    let segments = [
        base_segment
    ];

    let cur_pos = [0, 0, 0];

    // the current seg rotation for normals and step
    let m_rot = m4.identity();
    // the current seg scale - will be comined with rotation to get new segment
    let m_scale = m4.identity();

    let total_tube_length = 0;

    for (let transform of transforms) {
        let step = transform[0];
        let rotations = transform[1];
        let scale = transform[2];

        total_tube_length += step;

        // calculate new face orientation (rotations and scales)
        // remember source code inreverse order to application
        if (rotations) {
            m_rot = multiply_many([
                // order of z, x, y chosen specially - twist -> pitch -> yaw
                m4.rotation_y(rotations[1]),
                m4.rotation_x(rotations[0]),
                m4.rotation_z(rotations[2]),
                m_rot
            ]);
        } else {
            m_rot = straight_down_matrix;
        }
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
            'normals': base_segment['normals'].map(v => m4.apply(m_rot, v)),
            'position_on_tube': total_tube_length
        });
    }

    function hull_segs(a, b, tube_percent, tube_interval_percent) {
        /* takes two segments and returns facets (triangles and
         * normals) note that the points and normals are 4d.
         *
         * tube percent should be float in [0,1) for how far a is along the
         * tube and seg_interval_percent is float in [0,1) of distance, as a
         * percent along tube, between the segments a and b
         */
        let points = [];
        let normals = [];
        let texpoints = [];
        if (a['points'].length != a['normals'].length ||
              b['points'].length != b['normals'].length ||
              a['normals'].length != b['normals'].length)
            console.error('segments not same size!');
        let circum_interval_percent = 1 / a['points'].length;
        for (let i = 0; i < a['points'].length; i++){
            let circum_percent = i / a['points'].length;
            let ni = i + 1 == a['points'].length ? 0 : i + 1;
            // verts describes two triangles to connect this index around the
            // segment to the next segment (i to ni), the third element is the
            // texcoord to used (in the scales texture coordinate space of
            // course)
            let verts = [
                [a, i, [0,0]], [a, ni, [1,0]], [b, i, [0,1]],
                [b, i, [0,1]], [a, ni, [1,0]], [b, ni, [1,1]]
            ];
            for (let v of verts) {
                points.push(v[0]['points'][v[1]]);
                normals.push(v[0]['normals'][v[1]]);
                let ts = 1;
                texpoints.push(get_texcoord('raspberry_scales', [
                    (circum_percent + circum_interval_percent * v[2][0]) * ts,
                    (1 - (tube_percent + v[2][1] * tube_interval_percent)) * ts,
                ]));
            }
        }
        return {
            'points': points,
            'normals': normals,
            'texpoints': texpoints
        }
    }

    let facets = {
        'points': [],
        'normals': [],
        'texpoints': []
    }

    for (let i = 0; i < segments.length - 1; i++){
        let hulled = hull_segs(
            segments[i], segments[i+1],
            segments[i]['position_on_tube'] / total_tube_length,
            (segments[i+1]['position_on_tube'] - segments[i]['position_on_tube'])/ total_tube_length
        );
        facets['points'].push(...hulled['points']);
        facets['normals'].push(...hulled['normals']);
        facets['texpoints'].push(...hulled['texpoints']);
    }

    return facets
}

function flatten_4d(array) {
    if (array.some(x => x[3] != 1)) console.error('told to flatten when w not 1', array);
    return array.map(v => v.slice(0,3)).flat();
}

function transform_facets(facets, m_all, m_rot){
    return {
        'points': facets['points'].map(v => m4.apply(m_all, v)),
        'normals': facets['normals'].map(v => m4.apply(m_rot, v)),
        'texpoints': facets['texpoints']
    }
}

//function populate_buffers() {
//    let positions = [];
//    let normals = [];
//
//    let dragon = form_dragon();
//    positions.push(...flatten_4d(dragon['points']));
//    normals.push(...flatten_4d(dragon['normals']));
//
//    gl.bindBuffer(gl.ARRAY_BUFFER, positions_buffer);
//    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
//
//    gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
//    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
//
//    //return number of triangles
//    if (positions.length != normals.length) console.error('normals and positions different lengths');
//    return positions.length / 3;
//}

function calculate_position_along_part(part, x) {
    /* x should be float from 0 to 1. Returns 3d position of that proportion
     * along tube part.
     */
    let transformations = typeof(part[1]) == 'function' ? part[1](time_ms / 500) : part[1];
    let mirror = part[2];
    let rotations = part[3];
    let translation = part[4];

    let cur_pos = [0, 0, 0];

    let m_rot = m4.identity();
    for (let i = 0; i < parseInt(x * transformations.length); i++) {
        let step = transformations[i][0];
        let rots = transformations[i][1];
        m_rot = multiply_many([
            m4.rotation_y(rots[1]),
            m4.rotation_x(rots[0]),
            m4.rotation_z(rots[2]),
            m_rot
        ]);
        cur_pos = misc.add_vec(
            cur_pos,
            m4.apply(m_rot, [0, 0, step, 1]).slice(0,3)
        );
    }

    // after computing the position along the dragon then need to rotate that
    // position and add the shape translation
    //
    let m_shape_rot = multiply_many([
        m4.rotation_y(rotations[1]),
        m4.rotation_x(rotations[0]),
        m4.rotation_z(rotations[2]),
        [[mirror ? -1 : 1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    ]);
    cur_pos = misc.add_vec(translation, m4.apply(m_shape_rot, [...cur_pos, 1]).slice(0,3));
    return cur_pos;
}

function form_dragon(time_ms, tilt_matrix) {
    // do rotation down first as need to have inverse tilt ready to cancel with
    // actual tilt i.e. T * T^-1 * R rather than T * R * T^-1
    let down_matrix = m4.multiply(m4.inverse(tilt_matrix), m4.rotation_x(Math.PI/2));

    let tail = [
        [
            [  0.3 ,   0.3 ],
            [  0.6 ,  -0.2 ],
            [  0.2 ,  -0.5 ],
            [ -0.2 ,  -0.5 ],
            [ -0.6 ,  -0.2 ],
            [ -0.3 ,   0.3 ],
        ],
        function(t) {
            let tail_length = 6;
            let num_segs = 10;
            let segs = [[1, false, 1]]; // ITS NOT WORKING BECAUSE THE TAIL IS BEING ROTATED 180deg
            for (let i = 0; i < num_segs; i++) {
                let x  = i / num_segs;
                segs.push([
                    tail_length / num_segs,
                    // ASJUST THESE PARAMETERS for different tail-wagging
                    // work by k * sin(a t + b x) where k, a, b constants
                    [
                        0.1 *
                        Math.sin(
                            1 * t +
                            6 * x
                        ),
                        0.1 *
                        Math.sin(
                            1 * t +
                            6 * x
                        ),
                        0
                    ],
                    0.92
                ]);
            }
            segs.push([0.4, [0, 0, 0], 0]);
            return segs;
        },
        false,
        [0, Math.PI, 0],
        [0, 0, 0.4]
    ];

    let body = [
         [
            [  0.3 ,   0.2 ],
            [  0.4 ,  -0.2 ],
            [  0.2 ,  -0.3 ],
            [    0 , -0.4],
            [ -0.2 ,  -0.3 ],
            [ -0.4 ,  -0.2 ],
            [ -0.3 ,   0.2 ],

         ],
            [
                [1, [0,0,0], 2.0],
                [1, [0,0,0], 1.1],
                [1, [0,0,0], 1.4],
                [1, [-0.2,0,0], 1.3],
                [1, [-0.4,0,0], 1.1],
                [1, [-0.1,0,0], 0.8],
                [1, [0.3,0,0], 0.4],
                [1, [0, 0, 0], 0]
             ],
         false,
         [0, 0, 0],
         [0, 0, 0]
    ];

    let leg1 = [
        [
            [  0.3 ,   0.2 ],
            [  0.4 ,  -0.2 ],
            [  0.2 ,  -0.3 ],
            [    0 , -0.4],
            [ -0.2 ,  -0.3 ],
            [ -0.4 ,  -0.2 ],
            [ -0.3 ,   0.2 ],
        ],
        [
                [0.3, [0,0,0], 1.4],
                [0.5, [0,0,0], 1.1],
                [0.5, [0,0,0], 1.1],
                [0.5, [0.5,1.1,0], 1],
                [0.5, [0.3,0.3,0], 0.6],
                [0.5, [0,0,0], 1],
                [0.5, [0,0,-0.4], 0.8],
                [0.5, [0,0,-0.5], 1.2],
                [0.5, [0,0,-0.2], 1],
                [0.2, [0,0,0.2], 1.5],
                [0.05, [0,0,0], 1],
                [0.2, [0,0,0], 0.7],
                [0.0, [0,0,0], 0]
         ],
        false,
        [0, Math.PI / 2, 0],
        calculate_position_along_part(body, 0.2)
    ];

    let leg2 = [
        [
            [  0.3 ,   0.2 ],
            [  0.4 ,  -0.2 ],
            [  0.2 ,  -0.3 ],
            [    0 , -0.4],
            [ -0.2 ,  -0.3 ],
            [ -0.4 ,  -0.2 ],
            [ -0.3 ,   0.2 ],
        ],
        [
                [0.4, [0,0,0], 1.4],
                [0.7, [0,0,0], 1.1],
                [0.7, [0,0,0], 1.1],
                [0.5, [1,0.6,0], 1],
                [0.5, [0.3,0.3,0], 0.6],
                [0.5, [0,0,0], 1],
                [0.5, [0,0,-0.2], 0.8],
                [0.5, [0,0,-0.3], 1.2],
                [0.5, [0,0,-0.1], 1],
                [0.2, [0,0,0.2], 1.5],
                [0.05, [0,0,0], 1],
                [0.2, [0,0,0], 0.7],
                [0.0, [0,0,0], 0]
         ],
        false,
        [0, Math.PI / 2, 0],
        calculate_position_along_part(body, 0.5)
    ];


    let leg3 = leg1.map(a => a); //cheap copy of some sub arrays
    let leg4 = leg2.map(a => a); //cheap copy of some sub arrays

    leg3[2] = true;
    leg4[2] = true;
    leg3[3] = [0, -Math.PI / 2, 0];
    leg4[3] = [0, -Math.PI / 2, 0];

    let wing_rots = [
        -0.15,
        0,
        0.5 * Math.sin(2 * time_ms / 500) - 1,
    ];
    let wing1 = [
        [
            [ -0.2,  0],
            [   0, -0.2],
            [  0.2,  0],
            [   0,  0.2]
        ],
        function () {
            let wing_length = 14;
            let angles = [-0.6, -0.5, -0.2, -0.05, -0.3];
            let steps = 10;
            let a = [];
            for (let i = 0; i < steps; i++){
                a.push(
                [
                    wing_length / steps,
                    [angles[parseInt(i/steps * angles.length)], 0, 0],
                    0.97
                ]);
            }
            // closing spike !
            a.push([0.3, [0, 0, 0], 0]);
            return a;
        },
        false,
        wing_rots,
        misc.add_vec(calculate_position_along_part(body, 0.7), [1, 0, -0.3])
    ];

    let wing2 = wing1.map(v=>v);
    wing2[3] = [wing_rots[0], wing_rots[1], -wing_rots[2]];
    wing2[4] = misc.add_vec(calculate_position_along_part(body, 0.7), [-1, 0, -0.3]);

    let head = [
        [
            [ -0.3, -0.25],
            [ -0.5, -0.1],
            [ -0.5,  0.1],
            [ -0.4,  0.2],
            [    0,  0.4],
            [  0.4,  0.2],
            [  0.5,  0.1],
            [  0.5, -0.1],
            [  0.3, -0.25]
        ],
        [
            [0.6, [0,0,0], 2],
            [0.4, [0.6,0,0], 1.4],
            [0.5, [0.4,0,0], 1],
            [0.5, [0.3,0,0], 1],
            [0.3, [0,0,0], 0.8],
            [0.1, [0,0,0], 0.8],
            [0.1, [0,0,0], 0.6],
            [0.1, [0,0,0], 0.2],
            [0, [0,0,0], 0]
        ],
        false,
        [-1.1, 0, 0],
        calculate_position_along_part(body, 0.96)
    ];

    let test_part = [
        [
            [-1, -1],
            [-1,  1],
            [ 1,  1],
            [ 1, -1]
        ],
        [
            [1, [0, 0, 0], 1],
            [1, [0, 0, 0], 1],
            [1, [0, 0, 0], 1],
            [1, false, 1],
            [1, [0, 0, 0], 1],
            [1, [0, 0, 0], 1],
        ],
        false,
        [0,0,0],
        [0,0,0],
    ];

    let tube_parts = [
        // [seg shape, seg transform func, rotation, translation]
        tail,
        body,
        leg1,
        leg2,
        leg3,
        leg4,
        wing1,
        wing2,
        head

        //test_part
    ];
    let points = [];
    let normals = [];
    let texpoints = [];
    // for each part we generate the tube then rotate and translate it
    for (let part of tube_parts) {
        let seg_shape = part[0];
        let seg_transforms = typeof(part[1]) == 'function' ? part[1](time_ms / 500) : part[1];
        let mirror = part[2];
        let rotations = part[3];
        let translation = part[4];
        let m_rot = multiply_many([
            m4.rotation_y(rotations[1]),
            m4.rotation_x(rotations[0]),
            m4.rotation_z(rotations[2]),
            [[mirror ? -1 : 1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
        ]);
        let m_all = m4.multiply(m4.translation(...translation), m_rot);
        let tube = generate_tube(seg_shape, seg_transforms, m4.multiply(m4.inverse(m_rot), down_matrix));
        let transformed_tube = transform_facets(tube, m_all, m_rot);
        points.push(...transformed_tube['points']);
        normals.push(...transformed_tube['normals']);
        texpoints.push(...transformed_tube['texpoints']);
    }
    // generate wing fabric using a triangle fan arrangement
    let to_4d = v => [...v, 1];
    let num_attachments = 40;
    for (let i = 0; i < num_attachments; i++){
        points.push(to_4d(calculate_position_along_part(wing1, 0)));
        points.push(to_4d(calculate_position_along_part(wing1, i / num_attachments)));
        points.push(to_4d(calculate_position_along_part(wing1, (i + 1) / num_attachments)));
        normals.push([0, 1, 0, 1]); // could generate normals with cross product?
        normals.push([0, 1, 0, 1]);
        normals.push([0, 1, 0, 1]);
        texpoints.push([1,1]);
        texpoints.push([1,1]);
        texpoints.push([1,1]);
    }
    for (let i = 0; i < num_attachments; i++){
        points.push(to_4d(calculate_position_along_part(wing2, 0)));
        points.push(to_4d(calculate_position_along_part(wing2, i / num_attachments)));
        points.push(to_4d(calculate_position_along_part(wing2, (i + 1) / num_attachments)));
        normals.push([0, 1, 0, 1]);
        normals.push([0, 1, 0, 1]);
        normals.push([0, 1, 0, 1]);
        texpoints.push([1,1]);
        texpoints.push([1,1]);
        texpoints.push([1,1]);
    }

    return {
        'points': points,
        'normals': normals,
        'texpoints': texpoints
    };
}
