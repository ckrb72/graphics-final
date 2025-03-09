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

    var model_loc = gl.getUniformLocation(program, "model");
    var projection_loc = gl.getUniformLocation(program, "projection");
    var view_loc = gl.getUniformLocation(program, "view");

    var ambient_map_loc = gl.getUniformLocation(program, "ambient_map");
    var normal_map_loc = gl.getUniformLocation(program, "normal_map");

    gl.useProgram(program);
    gl.uniform1i(ambient_map_loc, 0);
    gl.uniform1i(normal_map_loc, 1);

    var model = mat4(1.0);
    model = scalem(0.1, 0.1, 0.1);
    var projection = perspective(45.0, canvas.width / canvas.clientHeight, 0.1, 1000.0);
    var cam_pos = vec3(0.0, 0.0, 5.0);
    var cam_dir = vec3(0.0, 0.0, -1.0);
    var camera = lookAt(cam_pos, vec3(0.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0));
    var theta = 0.0;

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

    
    var cam_radius = 5.0;
    var selected_shader = none_shader;
    const shader_map = new Map();
    shader_map.set('none', none_shader);

    var grayscale_shader = initShaders(gl, 'square-vertex', 'grayscale-fragment');
    var inverted_shader = initShaders(gl, 'square-vertex', 'invert-fragment');

    shader_map.set('grayscale', grayscale_shader);
    shader_map.set('invert', inverted_shader);

    var post_process = document.getElementById('post-process-dropdown');
    post_process.addEventListener('change', () => {
        selected_shader = shader_map.get(post_process.value);
    });

    var cam_type_dropdown = document.getElementById("camera-dropdown");
    var cam_type = cam_type_dropdown.value;
    cam_type_dropdown.addEventListener('change', () => {
        cam_type = cam_type_dropdown.value;
        cam_pos = vec3(0.0, 0.0, 5.0);
    });

    var model_arr = [];
    parse_model("./Table.json", gl).then(meshes => {
        const scene_object = {
            meshes: meshes,
            transform: {
                scale: 1.0,
                position: vec3(0.0, 0.0, 0.0),
                rotation: {
                    angle: 0.0,
                    axis: vec3(0.0, 1.0, 0.0)
                }
            }
        };
        model_arr.push(scene_object);
    });

    // Have to do this since the image data is flipped when loading from the json
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

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

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clearColor(0.3, 0.3, 0.3, 1.0);

        gl.useProgram(program);


        var rotated_model = mult(rotate(theta, vec3(0.0, 1.0, 0.0)), model);
        theta = -90.0;
        gl.uniformMatrix4fv(model_loc, false, flatten(rotated_model));
        gl.uniformMatrix4fv(projection_loc, false, flatten(projection));
        gl.uniformMatrix4fv(view_loc, false, flatten(camera));

        gl.enableVertexAttribArray(pos_attrib);
        gl.enableVertexAttribArray(norm_attrib);
        gl.enableVertexAttribArray(tex_attrib);

        model_arr.forEach((item) => {
            item.meshes.forEach((mesh) => {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, mesh.ambient_map);
    
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, mesh.normal_map);
    
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos_buf);
                gl.vertexAttribPointer(pos_attrib, 3, gl.FLOAT, false, 3 * 4, 0);
    
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.norm_buf);
                gl.vertexAttribPointer(norm_attrib, 3, gl.FLOAT, false, 3 * 4, 0);
    
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv_buf);
                gl.vertexAttribPointer(tex_attrib, 2, gl.FLOAT, false, 2 * 4, 0);
    
                gl.drawArrays(gl.TRIANGLES, 0, mesh.vert_count);
            });
        });

        gl.disableVertexAttribArray(pos_attrib);
        gl.disableVertexAttribArray(norm_attrib);
        gl.disableVertexAttribArray(tex_attrib);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        //gl.clearColor(0.3, 0.3, 0.3, 1.0);

        gl.useProgram(selected_shader);

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

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);


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

        // Load buffers
        var pos_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, pos_buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(json.geometries[0].data.attributes.position.array), gl.STATIC_DRAW);
    
        var norm_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, norm_buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(json.geometries[0].data.attributes.normal.array), gl.STATIC_DRAW);
    
        var uv_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uv_buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(json.geometries[0].data.attributes.uv.array), gl.STATIC_DRAW);
    
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Load Textures

        // Get the textures from the json
        var ambient_tex = gl.createTexture();
        var normal_tex = gl.createTexture();
        {
            // Get the corresponding textures for each map in the material
            var ambient_image_id = find_uuid(json.textures, json.materials[0].map).image;
            var normal_image_id = find_uuid(json.textures, json.materials[0].normalMap).image;

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
    
        // One model can have many meshes
        var meshes = [];
        meshes.push({
            vert_count: json.geometries[0].data.attributes.position.array.length / 3,
            pos_buf: pos_buf,
            norm_buf: norm_buf,
            uv_buf: uv_buf,
            normal_map: normal_tex,
            ambient_map: ambient_tex
        });
        /*model.vert_count = json.geometries[0].data.attributes.position.array.length / 3;
        model.pos_buf = pos_buf;
        model.norm_buf = norm_buf;
        model.uv_buf = uv_buf;
        model.normal_map = normal_tex;
        model.ambient_map = ambient_tex;*/


        return meshes;
    }
    catch (error)
    {
        console.error(error.message);
    }
}


function find_uuid(arr, uuid)
{
    return arr.filter( (item) => {
        return item.uuid === uuid;
    })[0];
}