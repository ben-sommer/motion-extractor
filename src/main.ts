// Access elements
const videoInput = document.getElementById("videoInput") as HTMLInputElement;
const video = document.getElementById("video") as HTMLVideoElement;
const inputCanvas = document.getElementById("inputCanvas") as HTMLCanvasElement;
const webglCanvas = document.getElementById("webglCanvas") as HTMLCanvasElement;
const outputCanvas = document.getElementById(
	"outputCanvas"
) as HTMLCanvasElement;

// Get the 2D contexts
const inputCtx = inputCanvas.getContext("2d")!;
const outputCtx = outputCanvas.getContext("2d")!;

// Set up WebGL context
const gl = webglCanvas.getContext("webgl")!;
if (!gl) {
	alert("WebGL not supported");
}

// Load video when user selects it
videoInput.addEventListener("change", (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files ? target.files[0] : null;
	if (file) {
		const url = URL.createObjectURL(file);
		video.src = url;
		video.play();
	}
});

// Ensure video is loaded and set canvas dimensions
video.addEventListener("loadedmetadata", () => {
	// Wait for video dimensions to be loaded
	if (video.videoWidth && video.videoHeight) {
		inputCanvas.width = video.videoWidth;
		inputCanvas.height = video.videoHeight;
		webglCanvas.width = video.videoWidth;
		webglCanvas.height = video.videoHeight;
		outputCanvas.width = video.videoWidth;
		outputCanvas.height = video.videoHeight;

		// Adjust WebGL canvas size to fit video
		fitCanvasToVideo();

		// Ensure WebGL viewport matches the canvas size
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	}
});

// WebGL setup (simple shader program)
const vsSource = `
    attribute vec2 a_position;
    varying vec2 v_texCoord;

    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = (a_position + 1.0) / 2.0; // Map [-1, 1] coordinates to [0, 1] for texture
    }
`;

const fsSource = `
    precision mediump float;
    uniform sampler2D u_texture;
    varying vec2 v_texCoord;

    void main() {
        // Flip the Y coordinate to invert the texture
        vec2 flippedCoord = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
        
        // Sample the texture with flipped Y coordinate
        vec4 color = texture2D(u_texture, flippedCoord);

        // Convert to grayscale using a common weighted average for luminance
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));  // Rec. 709 luminance
        gl_FragColor = vec4(vec3(gray), 1.0);  // Output the grayscale color
    }
`;

// Compile shaders and set up WebGL program
const compileShader = (source: string, type: number): WebGLShader | null => {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error("ERROR compiling shader!", gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	return shader;
};

const vertexShader = compileShader(vsSource, gl.VERTEX_SHADER);
const fragmentShader = compileShader(fsSource, gl.FRAGMENT_SHADER);

const shaderProgram = gl.createProgram();
if (vertexShader && fragmentShader) {
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		console.error(
			"ERROR linking program!",
			gl.getProgramInfoLog(shaderProgram)
		);
	}
}

// Set up position buffer for full-screen quad
const vertices: Float32Array = new Float32Array([
	-1.0,
	-1.0, // Bottom-left corner
	1.0,
	-1.0, // Bottom-right corner
	-1.0,
	1.0, // Top-left corner
	-1.0,
	1.0, // Top-left corner
	1.0,
	-1.0, // Bottom-right corner
	1.0,
	1.0, // Top-right corner
]);

// Position buffer for full-screen quad
const positionBuffer = gl.createBuffer();
if (positionBuffer) {
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

// Get attribute and uniform locations
const aPosition = gl.getAttribLocation(shaderProgram, "a_position");
const uTexture = gl.getUniformLocation(shaderProgram, "u_texture");

// Setup texture for video
const texture = gl.createTexture();
if (texture) {
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

// Adjust WebGL canvas size to fit the video
function fitCanvasToVideo() {
	const videoAspectRatio = video.videoWidth / video.videoHeight;
	const canvasAspectRatio = webglCanvas.width / webglCanvas.height;

	if (videoAspectRatio > canvasAspectRatio) {
		// Stretch horizontally to fit the width
		webglCanvas.height = webglCanvas.width / videoAspectRatio;
	} else {
		// Stretch vertically to fit the height
		webglCanvas.width = webglCanvas.height * videoAspectRatio;
	}
	// Reset WebGL viewport after resizing
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}

// Render loop
function render(): void {
	if (video.paused || video.ended) return;

	// Ensure the canvas is not drawn before the video is fully loaded
	if (inputCanvas.width === 0 || inputCanvas.height === 0) return;

	// Draw the video frame to the input canvas
	inputCtx.drawImage(video, 0, 0, inputCanvas.width, inputCanvas.height);

	// Update WebGL texture with the inputCanvas content
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		inputCanvas
	);

	// Clear WebGL canvas and draw the video with WebGL
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.useProgram(shaderProgram);

	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(aPosition);

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.uniform1i(uTexture, 0);

	gl.drawArrays(gl.TRIANGLES, 0, 6);

	// Copy WebGL output to the output canvas
	outputCtx.drawImage(webglCanvas, 0, 0);
	requestAnimationFrame(render); // Continue rendering
}

// Start rendering when the video is ready to play
video.addEventListener("play", () => {
	render();
});
