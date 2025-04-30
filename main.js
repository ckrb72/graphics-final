// Holds all the models we want.
// Doing it this way so we can have many objects reuse one model (may be overkill for this project but I might allow for multiple lights so this would be helpful)
// map of id -> model (array of meshes)
const model_map = new Map();

// map of id -> scene_object that holds model/meshes and transform
const scene = new Map();

function main()
{
    const canvas = document.getElementById('webgl-canvas');

    const aspect_ratio = 16.0 / 9.0;
    canvas.width = window.innerWidth / 1.5;
    canvas.height = canvas.width * (1 / aspect_ratio);

    canvas.addEventListener("click", () => {
        canvas.requestPointerLock();
    });

    var input_map = new Map();

    window.addEventListener("keydown", (event) => {
        if (document.pointerLockElement === canvas && event.key === ' ') event.preventDefault();
        input_map.set(event.key.toLowerCase(), 1);
    });

    window.addEventListener("keyup", (event) => {
        input_map.set(event.key.toLowerCase(), 0);
    });

    /** @type {WebGL2RenderingContext} */
    const gl = canvas.getContext('webgl2');

    if(!gl)
    {
        console.error('WebGL2 Not Supported');
        alert('WebGL2 Not Supported');
    }

    var square_vertices = new Float32Array([
        -1.0, -1.0,     0.0, 0.0,
        1.0, -1.0,      1.0, 0.0,
        1.0, 1.0,       1.0, 1.0,
        -1.0, 1.0,      0.0, 1.0
    ]);

    var square_indices = new Uint32Array([
        0, 1, 2,
        2, 3, 0
    ]);

    var none_shader = initShaders(gl, 'square-vertex', 'none-fragment');
    var square_pos_attrib = gl.getAttribLocation(none_shader, "pos");
    var square_tex_attrib = gl.getAttribLocation(none_shader, "v_tex");

    var frame_tex_loc = gl.getUniformLocation(none_shader, "frame_tex");
    gl.useProgram(none_shader);
    gl.uniform1i(frame_tex_loc, 0);

    var square_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, square_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, square_vertices, gl.STATIC_DRAW);

    var square_index_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, square_index_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, square_indices, gl.STATIC_DRAW);


    var program = initShaders(gl, 'vertex-shader', 'fragment-shader');

    var pos_attrib = gl.getAttribLocation(program, "v_pos");
    var norm_attrib = gl.getAttribLocation(program, "v_norm");
    var tex_attrib = gl.getAttribLocation(program, "v_tex");
    var tangent_attrib = gl.getAttribLocation(program, "v_tangent");
    var bitangent_attrib = gl.getAttribLocation(program, "v_bitangent");


    var model_loc = gl.getUniformLocation(program, "model");
    var projection_loc = gl.getUniformLocation(program, "projection");
    var view_loc = gl.getUniformLocation(program, "view");

    var item_texture_loc = gl.getUniformLocation(program, "item_texture");
    var normal_map_loc = gl.getUniformLocation(program, "normal_map");
    var norm_matrix_loc = gl.getUniformLocation(program, "norm_matrix");
    var light_pos_loc = gl.getUniformLocation(program, "light_pos");
    var light_space_loc = gl.getUniformLocation(program, "light_space_mat");
    var shadow_map_loc = gl.getUniformLocation(program, "shadow_map");
    var cam_pos_loc = gl.getUniformLocation(program, "cam_pos");
    var light_constant_loc = gl.getUniformLocation(program, "light.constant_factor");
    var light_linear_loc = gl.getUniformLocation(program, "light.linear_factor");
    var light_quadratic_loc = gl.getUniformLocation(program, "light.quadratic_factor");
    var light_color_loc = gl.getUniformLocation(program, "light_color");

    var shadow_program = initShaders(gl, 'shadow-vertex', 'passthrough-fragment');
    var shadow_model_loc = gl.getUniformLocation(shadow_program, "model");
    var shadow_lightspace_mat_loc = gl.getUniformLocation(shadow_program, "lightspace_mat");
    var shadow_pos_loc = gl.getAttribLocation(shadow_program, "v_pos");

    gl.useProgram(program);
    gl.uniform1i(item_texture_loc, 0);
    gl.uniform1i(normal_map_loc, 1);
    gl.uniform1i(shadow_map_loc, 2);

    model = scalem(0.1, 0.1, 0.1);
    var projection = perspective(45.0, canvas.width / canvas.clientHeight, 0.1, 1000.0);
    var cam_pos = vec3(0.0, 0.0, 5.0);
    var cam_dir = vec3(0.0, 0.0, -1.0);
    var camera = lookAt(cam_pos, vec3(0.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0));

    var framebuffer = gl.createFramebuffer();
    var color_attachment = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, color_attachment);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color_attachment, 0);

    var depth_stencil_buffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth_stencil_buffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH32F_STENCIL8, canvas.width, canvas.height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depth_stencil_buffer);
    
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) console.log('framebuffer status failed');

    // Create Shadow Map
    const shadow_map_width = 4096;
    const shadow_map_height = 4096;
    var shadow_map = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadow_map);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, shadow_map_width, shadow_map_height, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    //var shadow_projection = ortho(-10.0, 10.0, -10.0, 10.0, 1.0, 7.5);
    var shadow_projection = perspective(150.0, shadow_map_width / shadow_map_height, 1.0, 7.5);
    var shadow_view = lookAt(vec3(0.0, 1.0, 2.0), vec3(0.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0));

    var lightspace_mat = mult(shadow_projection, shadow_view);

    var shadow_framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadow_framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadow_map, 0);

    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) console.log('shadow framebuffer status failed');

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.enable(gl.DEPTH_TEST);

    var mouse_theta = 180.0;
    var mouse_phi = 0.0;
    const MOUSE_SENSITIVITY = 0.1;

    canvas.addEventListener("mousemove", (event) =>{
        if(document.pointerLockElement === canvas)
        {
            mouse_theta += event.movementX * MOUSE_SENSITIVITY;
            mouse_phi += event.movementY * MOUSE_SENSITIVITY;
            if(mouse_phi >= 89.0) mouse_phi = 89.0;
            if(mouse_phi <= -89.0) mouse_phi = -89.0;
        }
    });

    
    var cam_radius = 6.0;
    var selected_shader = none_shader;
    const shader_map = new Map();
    shader_map.set('none', none_shader);

    var grayscale_shader = initShaders(gl, 'square-vertex', 'grayscale-fragment');
    var inverted_shader = initShaders(gl, 'square-vertex', 'invert-fragment');
    var blur_shader = initShaders(gl, 'square-vertex', 'blur-fragment');
    var blur_axis_loc = gl.getUniformLocation(blur_shader, 'blur_axis');
    var edge_detection_shader = initShaders(gl, 'square-vertex', 'edge-detection-fragment');

    shader_map.set('grayscale', grayscale_shader);
    shader_map.set('invert', inverted_shader);
    shader_map.set('blur', blur_shader);
    shader_map.set('edge-detection', edge_detection_shader);

    var post_process = document.getElementById('post-process-dropdown');
    post_process.addEventListener('change', () => {
        selected_shader = shader_map.get(post_process.value);
    });

    var cam_type_dropdown = document.getElementById("camera-dropdown");
    var cam_type = cam_type_dropdown.value;
    cam_type_dropdown.addEventListener('change', (event) => {
        cam_type = cam_type_dropdown.value;
        cam_pos = vec3(0.0, 0.0, 5.0);
        cam_dir = vec3(0.0, 0.0, -1.0);
        if(cam_type_dropdown.value === 'first-person') mouse_theta = 180.0;
        else mouse_theta = 0.0;
        mouse_phi = 0.0;
    });


    // Scene graph menu element
    var scene_graph_menu = document.getElementById('scene-graph');

    parse_model("./Table.json", gl).then((meshes) => {
        model_map.set('Table', meshes);
        const scene_object = {
            lerp: {
                enabled: false,
                start_abs: vec3(0.0, -1.7, 0.0),
                end_abs: vec3(0.0, 0.3, 0.0),
                rate: 2.0,
                time: 0.0,
                multiplier: 1.0
            },
            name: 'Table',
            type: 'object',
            meshes: model_map.get('Table'),
            transform: {
                scale: 0.1,
                position: vec3(0.0, -0.7, 0.0),
                rotation: {
                    enabled: false,
                    angle: -90.0,
                    axis: vec3(0.0, 1.0, 0.0)
                }
            }
        }
        scene.set('Table', scene_object);

        let new_option = document.createElement('option');
        new_option.value = 'Table';
        new_option.text = 'Table';
        scene_graph_menu.appendChild(new_option);
    });

    parse_model("./spotlight.json", gl).then((meshes) => {
        model_map.set('spotlight', meshes);
        const scene_object = {
            name: 'spotlight',
            type: 'light',
            color: vec3(1.0, 1.0, 1.0),
            attenuation: vec3(1.0, 0.09, 0.032),
            meshes: model_map.get('spotlight'),
            transform: {
                scale: 0.01,
                position: vec3(0.0, 2.0, 1.0),
                rotation: {
                    enabled: false,
                    y_axis_angle: 180.0,
                    x_axis_angle: -63.43494882292201
                }
            }
        }
        scene.set('spotlight', scene_object);
        let new_option = document.createElement('option');
        new_option.value = 'spotlight';
        new_option.text = 'spotlight';
        scene_graph_menu.appendChild(new_option);
    });

    parse_model("./book.json", gl).then((meshes) => {
        model_map.set('book', meshes);
        const scene_object = {
            lerp: {
                enabled: true,
                start_abs: vec3(0.0, 0.15, 0.2),
                end_abs: vec3(0.0, 0.6, 0.2),
                rate: 2.0,
                time: 0.0,
                multiplier: 1.0
            },
            name: 'book',
            type: 'object',
            meshes: model_map.get('book'),
            transform: {
                scale: 0.001,
                position: vec3(0.0, 0.0, 0.2),
                rotation: {
                    enabled: true,
                    angle: 0.0,
                    axis: vec3(0.0, 1.0, 0.0)
                }
            }
        }
        scene.set('book', scene_object);
        let new_option = document.createElement('option');
        new_option.value = 'book';
        new_option.text = 'book';
        scene_graph_menu.appendChild(new_option);
    });

    parse_model("./Plane.json", gl).then((meshes) => {
        model_map.set('floor', meshes);
        const scene_object = {
            lerp: {
                enabled: false,
                start_abs: vec3(0.0, -1.7, 0.0),
                end_abs: vec3(0.0, 0.3, 0.0),
                rate: 2.0,
                time: 0.0,
                multiplier: 1.0
            },
            name: 'floor',
            type: 'object',
            meshes: model_map.get('floor'),
            transform: {
                scale: 1.0,
                position: vec3(0.0, -0.7, 0.0),
                rotation: {
                    enabled: false,
                    angle: -90.0,
                    axis: vec3(1.0, 0.0, 0.0)
                }
            }
        }
        scene.set('floor', scene_object);
        let new_option = document.createElement('option');
        new_option.value = 'floor';
        new_option.text = 'floor';
        scene_graph_menu.appendChild(new_option);
    })

    var properties_menu = document.getElementById('properties-menu');

    scene_graph_menu.addEventListener('click', () => {
        // Remove old properties div
        const old_props = document.getElementById('properties');
        if(old_props) old_props.remove();

        // Update properties div
        if(scene_graph_menu.value === '') return;

        // Wrap the add option in an object to make it easier for generate_properties to work with it
        let scene_object = {};
        if (scene_graph_menu.value === '+') scene_object = {type: '+'}
        else scene_object = scene.get(scene_graph_menu.value);

        properties_menu.appendChild(generate_properties(scene_object, scene_graph_menu));
    })

    // Have to do this since the image data is flipped when loading from the json
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Create blur framebuffers (need to do this because we need to do an extra pass (x-direction) and then a y-direction blur)
    let blur_framebuffer = gl.createFramebuffer();
    let blur_color_attachment = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blur_color_attachment);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindFramebuffer(gl.FRAMEBUFFER, blur_framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blur_color_attachment, 0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) { alert('framebuffer not good'); console.log('framebuffer status failed');}

    var raymarch_shader = initShaders(gl, 'raymarch-vertex', 'raymarch-fragment');
    var resolution_loc = gl.getUniformLocation(raymarch_shader, 'resolution');
    var raymarch_cam_pos = gl.getUniformLocation(raymarch_shader, 'cam_pos');
    var raymarch_cam_dir = gl.getUniformLocation(raymarch_shader, 'cam_dir');
    gl.useProgram(raymarch_shader);
    gl.uniform2fv(resolution_loc, new Float32Array([canvas.width, canvas.height]));

    var previous_time = Date.now();
    var delta = 0.0;
    var render = function()
    {
        var current_time = Date.now();
        delta = (current_time - previous_time) * 0.001;
        previous_time = current_time;
        if(document.pointerLockElement === canvas)
        {
            switch(cam_type)
            {
                case 'first-person':
                    cam_dir[0] = Math.sin(radians(-mouse_theta)) * Math.cos(radians(mouse_phi));
                    cam_dir[1] = -Math.sin(radians(mouse_phi));
                    cam_dir[2] = Math.cos(radians(-mouse_theta)) * Math.cos(radians(mouse_phi));
                
                    cam_dir = normalize(cam_dir);
                    var scaled_dir = scale(delta, cam_dir);

                    if(input_map.get('w') == 1) cam_pos = add(cam_pos, scaled_dir);
                    if(input_map.get('s') == 1) cam_pos = subtract(cam_pos, scaled_dir);
                    if(input_map.get(' ') == 1) cam_pos[1] += delta;
                    if(input_map.get('shift') == 1) cam_pos[1] -= delta;
                    if(input_map.get('a') == 1) cam_pos = subtract(cam_pos, scale(delta, normalize(cross(cam_dir, vec3(0.0, 1.0, 0.0)))));
                    if(input_map.get('d') == 1) cam_pos = add(cam_pos, scale(delta, normalize(cross(cam_dir, vec3(0.0, 1.0, 0.0)))));
                    camera = lookAt(cam_pos, add(cam_pos, cam_dir), vec3(0.0, 1.0, 0.0));
                    break;

                case 'orbit':
                    cam_pos[0] = cam_radius * Math.sin(radians(-mouse_theta)) * Math.cos(radians(mouse_phi));
                    cam_pos[1] = cam_radius * Math.sin(radians(mouse_phi));
                    cam_pos[2] = cam_radius * Math.cos(radians(-mouse_theta)) * Math.cos(radians(mouse_phi));
                    camera = lookAt(cam_pos, vec3(0.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0));
                    break;

                default:
                    break;
            }
        }

        // Update all objects
        for (const [key, object] of scene)
        {
            if(object.type !== 'object') continue;

            // Rotate
            if(object.transform.rotation.enabled) object.transform.rotation.angle += 20.0 * delta;

            // Lerp
            if(object.lerp.enabled) lerp(object, delta);
        }

        // Render Shadow Map
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadow_framebuffer);
        gl.viewport(0, 0, shadow_map_width, shadow_map_height);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(shadow_program);

        gl.uniformMatrix4fv(shadow_lightspace_mat_loc, false, flatten(lightspace_mat));

        gl.enableVertexAttribArray(shadow_pos_loc);
        // Render each model in the scene
        for(const [id, object] of scene)
        {
            // Create Model Matrix
            let model_mat = scalem(object.transform.scale, object.transform.scale, object.transform.scale);
            
            // Not using axis angle representation for lights since I couldn't figure out the math :(
            if(object.type === 'light')
            {
                model_mat = mult(rotateY(object.transform.rotation.y_axis_angle), model_mat);
                model_mat = mult(rotateX(object.transform.rotation.x_axis_angle), model_mat);
            }
            else
            {
                model_mat = mult(rotate(object.transform.rotation.angle, object.transform.rotation.axis), model_mat);
            }
            model_mat = mult(translate(object.transform.position[0], object.transform.position[1], object.transform.position[2]), model_mat);
            gl.uniformMatrix4fv(shadow_model_loc, false, flatten(model_mat));
    
            // For each model, render all it's meshes
            for(mesh of object.meshes)
            {
                // Bind Textures (assuming only ambient and normal maps)
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, mesh.item_tex);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, mesh.normal_map);
        
                // Bind Buffers
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos_buf);
                gl.vertexAttribPointer(shadow_pos_loc, 3, gl.FLOAT, false, 3 * 4, 0);
        
                // Draw
                gl.drawArrays(gl.TRIANGLES, 0, mesh.vert_count);
            }
        }

        gl.disableVertexAttribArray(shadow_pos_loc);

        // Render Scene
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clearColor(0.3, 0.3, 0.3, 1.0);

        gl.useProgram(program);

        var spotlight;
        if(spotlight = scene.get('spotlight'))
        {
            lightspace_mat = mult(shadow_projection, lookAt(spotlight.transform.position, vec3(0.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0)));
            gl.uniform3fv(light_pos_loc, flatten(spotlight.transform.position));
            gl.uniform1f(light_constant_loc, spotlight.attenuation[0]);
            gl.uniform1f(light_linear_loc, spotlight.attenuation[1]);
            gl.uniform1f(light_quadratic_loc, spotlight.attenuation[2]);
            gl.uniform3fv(light_color_loc, spotlight.color);
        }

        gl.uniformMatrix4fv(projection_loc, false, flatten(projection));
        gl.uniformMatrix4fv(view_loc, false, flatten(camera));
        gl.uniformMatrix4fv(light_space_loc, false, flatten(lightspace_mat));
        gl.uniform3fv(cam_pos_loc, flatten(cam_pos));

        // Bind shadow map for sampling in fragment shader
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, shadow_map);

        gl.enableVertexAttribArray(pos_attrib);
        gl.enableVertexAttribArray(norm_attrib);
        gl.enableVertexAttribArray(tex_attrib);
        gl.enableVertexAttribArray(3);
        gl.enableVertexAttribArray(4);

        // Render each model in the scene
        for(const [id, object] of scene)
        {
            // Create Model Matrix
            let model_mat = scalem(object.transform.scale, object.transform.scale, object.transform.scale);
            
            // Not using axis angle representation for lights since I couldn't figure out the math :(
            if(object.type === 'light')
            {
                model_mat = mult(rotateY(object.transform.rotation.y_axis_angle), model_mat);
                model_mat = mult(rotateX(object.transform.rotation.x_axis_angle), model_mat);
            }
            else
            {
                model_mat = mult(rotate(object.transform.rotation.angle, object.transform.rotation.axis), model_mat);
            }
            
                model_mat = mult(translate(object.transform.position[0], object.transform.position[1], object.transform.position[2]), model_mat);
            gl.uniformMatrix4fv(model_loc, false, flatten(model_mat));
            gl.uniformMatrix4fv(norm_matrix_loc, false, flatten(inverse4(transpose(model_mat))));

            // For each model, render all it's meshes
            for(mesh of object.meshes)
            {
                // Bind Textures (assuming only ambient and normal maps)
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, mesh.item_tex);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, mesh.normal_map);
    
                // Bind Buffers
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos_buf);
                gl.vertexAttribPointer(pos_attrib, 3, gl.FLOAT, false, 3 * 4, 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.norm_buf);
                gl.vertexAttribPointer(norm_attrib, 3, gl.FLOAT, false, 3 * 4, 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv_buf);
                gl.vertexAttribPointer(tex_attrib, 2, gl.FLOAT, false, 2 * 4, 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.tangent_buf);
                gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 3 * 4, 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bitangent_buf);
                gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 3 * 4, 0);
    
                // Draw
                gl.drawArrays(gl.TRIANGLES, 0, mesh.vert_count);
            }
        }

        gl.disableVertexAttribArray(pos_attrib);
        gl.disableVertexAttribArray(norm_attrib);
        gl.disableVertexAttribArray(tex_attrib);
        gl.disableVertexAttribArray(3);
        gl.disableVertexAttribArray(4);


        // Post-Processing

        if(post_process.value === 'blur')
        {
            gl.bindFramebuffer(gl.FRAMEBUFFER, blur_framebuffer);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(selected_shader);
            gl.uniform1i(blur_axis_loc, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, color_attachment);
            gl.bindBuffer(gl.ARRAY_BUFFER, square_buffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, square_index_buffer);

            gl.enableVertexAttribArray(square_pos_attrib);
            gl.enableVertexAttribArray(square_tex_attrib);

            gl.vertexAttribPointer(square_pos_attrib, 2, gl.FLOAT, false, 4 * 4, 0);
            gl.vertexAttribPointer(square_tex_attrib, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
            gl.drawElements(gl.TRIANGLES, square_indices.length, gl.UNSIGNED_INT, 0);

            gl.disableVertexAttribArray(square_pos_attrib);
            gl.disableVertexAttribArray(square_tex_attrib);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        //gl.clearColor(0.3, 0.3, 0.3, 1.0);

        gl.useProgram(selected_shader);
        //gl.useProgram(raymarch_shader);
        //gl.uniform3fv(raymarch_cam_pos, flatten(cam_pos));
        // gl.uniform3fv(raymarch_cam_dir, flatten(cam_dir));

        gl.activeTexture(gl.TEXTURE0);
        if(post_process.value === 'blur')
        {
            gl.bindTexture(gl.TEXTURE_2D, blur_color_attachment);
            gl.uniform1i(blur_axis_loc, 1);
        }
        else
        {
            gl.bindTexture(gl.TEXTURE_2D, color_attachment);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, square_buffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, square_index_buffer);

        gl.enableVertexAttribArray(square_pos_attrib);
        gl.enableVertexAttribArray(square_tex_attrib);

        gl.vertexAttribPointer(square_pos_attrib, 2, gl.FLOAT, false, 4 * 4, 0);
        gl.vertexAttribPointer(square_tex_attrib, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
        gl.drawElements(gl.TRIANGLES, square_indices.length, gl.UNSIGNED_INT, 0);

        gl.disableVertexAttribArray(square_pos_attrib);
        gl.disableVertexAttribArray(square_tex_attrib);


        setTimeout( () => { window.requestAnimationFrame(render) }, 0);
    }

    render();

}

window.addEventListener("load", main);

async function parse_model(path, gl)
{
    try
    {
        const response = await fetch(path);
        if(!response.ok)
        {
            throw new Error('failed to open file');
        }

        const json = await response.json();

        var current_object = json.object;

        var geometry = find_uuid(json.geometries, current_object.geometry);
        var material = find_uuid(json.materials, current_object.material);

        // Load buffers
        let pos_arr = new Float32Array(geometry.data.attributes.position.array);
        var pos_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, pos_buf);
        gl.bufferData(gl.ARRAY_BUFFER, pos_arr, gl.STATIC_DRAW);
    
        let norm_arr = new Float32Array(geometry.data.attributes.normal.array);
        var norm_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, norm_buf);
        gl.bufferData(gl.ARRAY_BUFFER, norm_arr, gl.STATIC_DRAW);
    
        let uv_arr = new Float32Array(geometry.data.attributes.uv.array);
        var uv_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uv_buf);
        gl.bufferData(gl.ARRAY_BUFFER, uv_arr, gl.STATIC_DRAW);
    
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        
        let tangent_arr = new Float32Array(clean_tangents(geometry.data.attributes.tangent.array));
        let tangent_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, tangent_buf);
        gl.bufferData(gl.ARRAY_BUFFER, tangent_arr, gl.STATIC_DRAW);

        let bitangent_arr = new Float32Array(calculate_bitangents(norm_arr, tangent_arr));
        let bitangent_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bitangent_buf);
        gl.bufferData(gl.ARRAY_BUFFER, bitangent_arr, gl.STATIC_DRAW);

        // Load Textures

        // Get the textures from the json
        var ambient_tex = gl.createTexture();
        var normal_tex = gl.createTexture();
        {
            // Get the corresponding textures for each map in the material
            var ambient_image_id = find_uuid(json.textures, material.map).image;
            var normal_image_id = find_uuid(json.textures, material.normalMap).image;

            // Get the corresponding images for each textures
            var ambient_image_url = find_uuid(json.images, ambient_image_id).url;
            var normal_image_url = find_uuid(json.images, normal_image_id).url;

            var ambient_image = new Image();
            ambient_image.src = ambient_image_url;

            ambient_image.addEventListener('load', () => {
                gl.bindTexture(gl.TEXTURE_2D, ambient_tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ambient_image);
                gl.generateMipmap(gl.TEXTURE_2D);
            });

            var normal_image = new Image();
            normal_image.src = normal_image_url;

            normal_image.addEventListener('load', () => {
                gl.bindTexture(gl.TEXTURE_2D, normal_tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, normal_image);
                gl.generateMipmap(gl.TEXTURE_2D);
            });
        }
    
        // One model can have many meshes (for right now there will only ever be 1 though)
        var meshes = [];
        meshes.push({
            vert_count: json.geometries[0].data.attributes.position.array.length / 3,
            pos_buf: pos_buf,
            norm_buf: norm_buf,
            tangent_buf: tangent_buf,
            bitangent_buf: bitangent_buf,
            uv_buf: uv_buf,
            normal_map: normal_tex,
            item_tex: ambient_tex
        });

        return meshes;
    }
    catch (error)
    {
        console.error(error.message);
    }
}

// Tangents are given as vec4. This strips them to be vec3
function clean_tangents(tangent)
{
    let tangent_arr = [];
    let tangent_count = tangent.length / 4;

    for(let i = 0; i < tangent_count; i++)
    {
        tangent_arr.push(tangent[(4 * i)]);
        tangent_arr.push(tangent[(4 * i) + 1]);
        tangent_arr.push(tangent[(4 * i) + 2]);
    }

    return tangent_arr;
}

function calculate_bitangents(norm, tangent)
{
    let bitangent_arr = [];
    let vec_count = norm.length / 3;

    for(let i = 0; i < vec_count; i++)
    {
        let tangent_vec = vec3(tangent[(3 * i)], tangent[(3 * i) + 1], tangent[(3 * i) + 2]);
        let normal_vec = vec3(norm[(3 * i)], norm[(3 * i) + 1], norm[(3 * i) + 2]);
        let bitangent_vec = flatten(cross(tangent_vec, normal_vec));

        bitangent_arr.push(bitangent_vec[0]);
        bitangent_arr.push(bitangent_vec[1]);
        bitangent_arr.push(bitangent_vec[2]);
    }


    return bitangent_arr;
}


function find_uuid(arr, uuid)
{
    return arr.filter( (item) => {
        return item.uuid === uuid;
    })[0];
}

function lerp_vec3(a, b, time)
{
    // fancy way of doing lerp = (b - a) * time + a;
    return add(a, scale(time, subtract(b, a)));
}

function lerp(scene_object, delta)
{
    scene_object.transform.position = lerp_vec3(scene_object.lerp.start_abs, scene_object.lerp.end_abs, scene_object.lerp.time / scene_object.lerp.rate);
    scene_object.lerp.time += delta * scene_object.lerp.multiplier;
    if(scene_object.lerp.time >= scene_object.lerp.rate)
    {
        scene_object.lerp.time = scene_object.lerp.rate;
        scene_object.lerp.multiplier = -scene_object.lerp.multiplier;
    }
    else if(scene_object.lerp.time <= 0.0)
    {
        scene_object.lerp.time = 0.0;
        scene_object.lerp.multiplier = -scene_object.lerp.multiplier;
    }
}

function generate_properties(scene_object, scene_list)
{
    let property_element = document.createElement('div');
    property_element.id = 'properties';

    switch(scene_object.type)
    {
        case 'empty':
            {
                const empty_text = document.createElement('p');
                empty_text.innerText = 'No Object Selected';
                property_element.appendChild(empty_text);
            }
            break;
        case '+':
            {
                const name_input = document.createElement('input');
                name_input.type = 'text';
                name_input.id = 'name_input';
                name_input.placeholder = 'Name';
                property_element.appendChild(name_input);

                const model_label = document.createElement('label');
                model_label.for = 'model-dropdown';
                model_label.innerText = 'Model: ';
                property_element.appendChild(model_label);

                const model_dropdown = document.createElement('select');
                model_dropdown.id = 'model-dropdown';
                for (const [key] of model_map) {
                    const option_element = document.createElement('option');
                    option_element.value = key;
                    option_element.text = key;
                    model_dropdown.appendChild(option_element);
                }
                property_element.appendChild(model_dropdown);

                // Lots of appendChild nightmare

                const position_div = create_vec_div('Position: ', 'object-pos', vec3(0.0, 0.0, 0.0));
                property_element.append(position_div);

                const rotation_div = create_vec_div('Axis: ', 'object-rotation', vec3(0.0, 1.0, 0.0));
                property_element.append(rotation_div);

                const rotation_angle = document.createElement('input');
                rotation_angle.type = 'number';
                rotation_angle.value = 0;
                rotation_angle.id = 'rotation-angle';
                const rotation_angle_label = document.createElement('label');
                rotation_angle_label.for = 'rotation-angle';
                rotation_angle_label.innerText = 'Angle: ';
                property_element.appendChild(rotation_angle_label);
                property_element.appendChild(rotation_angle);

                const scale_input = document.createElement('input');
                scale_input.type = 'number';
                scale_input.id = 'object-scale';
                scale_input.value = 1.0;
                const scale_input_label = document.createElement('label');
                scale_input_label.for = 'object-scale';
                scale_input_label.innerText = 'Scale: ';
                property_element.appendChild(scale_input_label);
                property_element.appendChild(scale_input);

                const create_button = document.createElement('button');
                create_button.id = 'create_button';
                create_button.innerText = 'Add';
                create_button.onclick = () => {
                    let name = name_input.value;

                    // generate random name if empty string is input or the name already exists
                    if(name === '' || scene.get(name) != null) {

                        // Random string generation from https://www.programiz.com/javascript/examples/generate-random-strings
                        const random_suffix = Math.random().toString(36).substring(6, 10);
                        name = 'obj-' + random_suffix;
                    }

                    const new_object = {
                        lerp: {
                            enabled: false,
                            start_abs: vec3(0.0, 0.0, 0.0),
                            end_abs: vec3(0.0, 1.0, 0.0),
                            rate: 2.0,
                            time: 0.0,
                            multiplier: 1.0
                        },
                        name: name,
                        type: 'object',
                        meshes: model_map.get(model_dropdown.value),
                        transform: {
                            scale: scale_input.value,
                            position: vecdiv_to_vec(position_div, false),
                            rotation: {
                                enabled: false,
                                angle: 0.0,
                                axis: vecdiv_to_vec(rotation_div, true)
                            }
                        }
                    }

                    scene.set(name, new_object);
                    const new_option = document.createElement('option');
                    new_option.text = name;
                    new_option.value = name;
                    scene_list.append(new_option);
                };
                property_element.appendChild(create_button);

            }
            break;

        case 'object':
            {
                const name = document.createElement('p');
                name.id = 'item-name';
                name.innerText = scene_object.name + ':';
                property_element.appendChild(name);


                const position_div = create_vec_div('Position: ', 'object-pos', scene_object.transform.position);
                const rotation_div = create_vec_div('Axis: ', 'object-rotation', scene_object.transform.rotation.axis);
                const scale_input = document.createElement('input');
                scale_input.type = 'number';
                scale_input.value = scene_object.transform.scale;
                scale_input.id = 'scale-input';
                const scale_input_label = document.createElement('label');
                scale_input_label.for = 'scale-input';
                scale_input_label.innerText = 'Scale: ';

                property_element.appendChild(position_div);
                property_element.appendChild(rotation_div);
                property_element.appendChild(scale_input_label);
                property_element.appendChild(scale_input);

                const lerp_start = create_vec_div('Start: ', 'lerp-start', scene_object.lerp.start_abs);
                const lerp_end = create_vec_div('End', 'lerp-end', scene_object.lerp.end_abs);
                property_element.appendChild(lerp_start);
                property_element.appendChild(lerp_end);

                const lerp_checkbox = document.createElement('input');
                lerp_checkbox.id = 'lerp-checkbox';
                lerp_checkbox.type = 'checkbox';
                lerp_checkbox.checked = scene_object.lerp.enabled;
                lerp_checkbox.onclick = () => {scene_object.lerp.enabled = lerp_checkbox.checked};
                const lerp_checkbox_label = document.createElement('label');
                lerp_checkbox_label.for = 'lerp-checkbox';
                lerp_checkbox_label.innerText = 'Lerp:';
                property_element.appendChild(lerp_checkbox_label);
                property_element.appendChild(lerp_checkbox);

                const rotate_checkbox = document.createElement('input');
                rotate_checkbox.id = 'rotate-checkbox';
                rotate_checkbox.type = 'checkbox';
                rotate_checkbox.checked = scene_object.transform.rotation.enabled;
                rotate_checkbox.onclick = () => {scene_object.transform.rotation.enabled = rotate_checkbox.checked};
                const rotate_checkbox_label = document.createElement('label');
                rotate_checkbox_label.for = 'rotate-checkbox';
                rotate_checkbox_label.innerText = 'Rotate: ';
                property_element.appendChild(rotate_checkbox_label);
                property_element.appendChild(rotate_checkbox);

                const update_button = document.createElement('button');
                update_button.id = 'update-button';
                update_button.innerText = 'Update';
                update_button.onclick = () => {
                    scene_object.transform.position = vecdiv_to_vec(position_div, false);
                    scene_object.transform.rotation.axis = vecdiv_to_vec(rotation_div, true);
                    scene_object.transform.scale = scale_input.value;
                    scene_object.lerp.start_abs = vecdiv_to_vec(lerp_start, false);
                    scene_object.lerp.end_abs = vecdiv_to_vec(lerp_end, false);
                };

                property_element.appendChild(update_button);

                const remove_button = document.createElement('button');
                remove_button.innerText = 'Remove';
                remove_button.onclick = () => {
                    // Delete object from scene
                    scene.delete(scene_object.name);

                    // Delete object from scene graph menu
                    const object_option_element = Array.from(scene_list.options).filter((object) => {return object.value === scene_object.name})[0];
                    object_option_element.remove();

                    // Remove Property Options from Properties Menu
                    const property_div = document.getElementById('properties');
                    if(property_div) property_div.remove();
                    var properties_menu = document.getElementById('properties-menu');
                    properties_menu.appendChild(generate_properties({type: 'empty'}, null));
                };
                property_element.appendChild(remove_button);
            }
            break;

        case 'light':
            {
                const name = document.createElement('p');
                name.id = 'item-name';
                name.innerText = scene_object.name + ':';
                property_element.appendChild(name);

                const color_picker = document.createElement('input');
                color_picker.type = 'color';
                color_picker.id = 'color-picker';
                color_picker.value = '#ffffff';
                color_picker.addEventListener('change', () => {
                    let red_hex = color_picker.value[1] + color_picker.value[2];
                    let green_hex = color_picker.value[3] + color_picker.value[4];
                    let blue_hex = color_picker.value[5] + color_picker.value[6];

                    // Convert hex to floats
                    let red = parseInt(red_hex, 16) / 256;
                    let green = parseInt(green_hex, 16) / 256;
                    let blue = parseInt(blue_hex, 16) / 256;
                    scene_object.color = vec3(red, green, blue);
                });

                const color_picker_label = document.createElement('label');
                color_picker_label.for = 'color-picker';
                color_picker_label.innerText = 'Color: ';
                property_element.appendChild(color_picker_label);
                property_element.appendChild(color_picker);

                const attenuation_div = create_vec_div('Attenuation: ', 'attenutation-div', scene_object.attenuation);
                property_element.appendChild(attenuation_div);

                // Let them change the position of the light

                const position_div = create_vec_div('Position: ', 'light-pos', scene_object.transform.position);
                property_element.appendChild(position_div);


                const update_button = document.createElement('button');
                update_button.id = 'update-button';
                update_button.innerText = 'Update';
                update_button.onclick = () => { 

                    // Remove message if already displayed
                    let error_div = document.getElementById('light-error-message');
                    if(error_div) property_element.removeChild(error_div);

                    let position_vec = vecdiv_to_vec(position_div, 0);

                    // Just check to make sure the position vec isn't <0.0, 1.0, 0.0> so the look direction
                    // doesn't become parallel to the up vector of the light and crash the program
                    if((position_vec[0] == 0.0) && (position_vec[1] % 1.0 === 0.0) && (position_vec[2] == 0.0))
                    {
                        position_vec[2] = 1.0;
                        position_div.children[3].value = 1;

                        // Display error message
                        const light_error_message = document.createElement('p');
                        light_error_message.innerText = 'ERROR: Light Sources Cannot Be Placed At (0, k, 0) Where k Is Any Number. Placing Light At (0, k, 1) Instead';
                        light_error_message.id = 'light-error-message';
                        property_element.appendChild(light_error_message);
                    }

                    scene_object.transform.position = position_vec;
                    
                    // Update light direction so it points at 0, 0, 0
                    let pos = scene_object.transform.position;
                    let y_axis_angle = Math.atan2(pos[0], pos[2]);

                    let x_axis_angle = Math.atan2(pos[1], pos[2]);
                    scene_object.transform.rotation.y_axis_angle = (y_axis_angle * 180.0 / Math.PI) + 180.0;
                    scene_object.transform.rotation.x_axis_angle = -(x_axis_angle * 180.0 / Math.PI);
                };

                property_element.appendChild(update_button);
            }
            break;

        default:
            break;
    }

    return property_element;
}

function create_vec_div(text, id, default_vec)
{
    const div = document.createElement('div');
    div.id = id;
    div.style.display = 'flex';

    const head = document.createElement('p');
    head.id = id + '-name';
    head.innerText = text;
    head.style.margin = 0;
    div.appendChild(head);

    const x_input = document.createElement('input');
    x_input.id = id + '-x';
    x_input.style.width = '25%';
    x_input.type = 'number';
    x_input.value = default_vec[0];
    const y_input = document.createElement('input');
    y_input.id = id + '-y';
    y_input.style.width = '25%';
    y_input.type = 'number';
    y_input.value = default_vec[1];
    const z_input = document.createElement('input');
    z_input.id = id + '-z';
    z_input.style.width = '25%';
    z_input.type = 'number';
    z_input.value = default_vec[2];

    div.appendChild(x_input);
    div.appendChild(y_input);
    div.appendChild(z_input);

    return div;
}

function vecdiv_to_vec(vec_div, assert_nonzero)
{
    let vec = vec3(parseFloat(vec_div.children[1].value), parseFloat(vec_div.children[2].value), parseFloat(vec_div.children[3].value));
    if(assert_nonzero && (vec[0] + vec[1] + vec[2]) == 0.0) vec = vec3(0.0, 1.0, 0.0);
    return vec;
}