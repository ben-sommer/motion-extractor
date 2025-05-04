const videoInput = document.getElementById("videoInput") as HTMLInputElement;
const video = document.getElementById("video") as HTMLVideoElement;
const inputCanvas = document.getElementById("inputCanvas") as HTMLCanvasElement;
const outputCanvas = document.getElementById(
	"outputCanvas"
) as HTMLCanvasElement;
const inputCtx = inputCanvas.getContext("2d", {
	willReadFrequently: true,
}) as CanvasRenderingContext2D;

let gl: WebGLRenderingContext;
let videoTexture: WebGLTexture;
let previousTexture: WebGLTexture;
let framebuffer: WebGLFramebuffer;
let shaderProgram: WebGLProgram;

videoInput.addEventListener("change", (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (!file) return;

	const url = URL.createObjectURL(file);
	video.src = url;

	video.addEventListener("loadedmetadata", () => {
		inputCanvas.width = outputCanvas.width = video.videoWidth;
		inputCanvas.height = outputCanvas.height = video.videoHeight;
		initWebGL(); // Initialize WebGL after metadata is loaded
		video.play();
		requestNextFrame();
	});
});

function requestNextFrame(): void {
	if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
		video.requestVideoFrameCallback(drawFrame);
	} else {
		console.error(
			"requestVideoFrameCallback is not supported in this browser."
		);
	}
}

// WebGL Initialization
function initWebGL() {
	gl = outputCanvas.getContext("webgl")!;
	if (!gl) {
		alert("WebGL not supported in this browser.");
		return;
	}

	// Initialize shaders and program
	shaderProgram = createShaderProgram();
	gl.useProgram(shaderProgram);

	// Initialize textures for current and previous frames
	videoTexture = gl.createTexture()!;
	previousTexture = gl.createTexture()!;

	// Set up framebuffer for rendering to output canvas
	framebuffer = gl.createFramebuffer()!;
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

	// Attach a texture to framebuffer (for rendering)
	const framebufferTexture = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, framebufferTexture);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		outputCanvas.width,
		outputCanvas.height,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		null
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		framebufferTexture,
		0
	);
}

function createShaderProgram(): WebGLProgram {
	const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = (a_position + 1.0) / 2.0; // Normalize to [0,1] range
  }
`;

	const fragmentShaderSource = `
  precision mediump float;
  uniform sampler2D u_videoTexture;
  uniform sampler2D u_previousTexture;
  varying vec2 v_texCoord;

  void main() {
    vec4 currentColor = texture2D(u_videoTexture, v_texCoord);
    vec4 previousColor = texture2D(u_previousTexture, v_texCoord);
    vec3 colorDiff = abs(currentColor.rgb - previousColor.rgb);
    
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);  // Show the difference in RGB
  }
`;

	// gl_FragColor = vec4(colorDiff, 1.0); // Show the difference in RGB

	const vertexShader = compileShader(
		gl,
		gl.VERTEX_SHADER,
		vertexShaderSource
	);
	const fragmentShader = compileShader(
		gl,
		gl.FRAGMENT_SHADER,
		fragmentShaderSource
	);

	const program = gl.createProgram()!;
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		alert("Shader program failed to link.");
		return program;
	}

	return program;
}

function compileShader(
	gl: WebGLRenderingContext,
	type: number,
	source: string
): WebGLShader {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		alert("Shader failed to compile: " + gl.getShaderInfoLog(shader));
	}

	return shader;
}

function loadVideoFrameToTexture(texture: WebGLTexture, videoFrame: ImageData) {
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		videoFrame.width,
		videoFrame.height,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		videoFrame.data
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	// Check for any OpenGL errors
	const error = gl.getError();
	if (error !== gl.NO_ERROR) {
		console.error("WebGL Error during texture upload:", error);
	}
}

function drawFrame() {
	// Draw the video frame on the input canvas
	inputCtx.drawImage(video, 0, 0, inputCanvas.width, inputCanvas.height);
	const currentFrame = inputCtx.getImageData(
		0,
		0,
		inputCanvas.width,
		inputCanvas.height
	);

	// Upload the current frame to the videoTexture
	loadVideoFrameToTexture(videoTexture, currentFrame);

	// Clear the framebuffer before rendering a new frame
	gl.clear(gl.COLOR_BUFFER_BIT);

	// Bind the framebuffer for processing the current frame
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

	// Bind the video texture to use in the shader
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, videoTexture);
	gl.uniform1i(gl.getUniformLocation(shaderProgram, "u_videoTexture"), 0);

	// If previousTexture exists, bind it to the shader
	if (previousTexture) {
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, previousTexture);
		gl.uniform1i(
			gl.getUniformLocation(shaderProgram, "u_previousTexture"),
			1
		);
	}

	// Draw the current frame with the shader applied (motion detection)
	drawQuad();

	// Now bind the default framebuffer (to render to the screen)
	gl.bindFramebuffer(gl.FRAMEBUFFER, null); // This switches back to the default canvas

	// Set the viewport to the size of the canvas (important for correct rendering)
	gl.viewport(0, 0, outputCanvas.width, outputCanvas.height);

	// Swap the textures: the current frame becomes the previous frame
	const temp = previousTexture;
	previousTexture = videoTexture;
	videoTexture = temp;

	// Request the next frame if the video is still playing
	if (!video.ended) {
		requestAnimationFrame(drawFrame);
	}
}

function drawQuad() {
	// Simple quad vertices for drawing a full screen image
	const vertices = new Float32Array([
		-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0,
	]);

	const vertexBuffer = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

	const positionLocation = gl.getAttribLocation(shaderProgram, "a_position");
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(positionLocation);

	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Start the video processing once metadata is loaded
video.addEventListener("loadedmetadata", () => {
	inputCanvas.width = outputCanvas.width = video.videoWidth;
	inputCanvas.height = outputCanvas.height = video.videoHeight;

	initWebGL();
	video.play();
	requestNextFrame();
});
