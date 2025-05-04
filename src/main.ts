// Access elements
const videoInput = document.getElementById("videoInput") as HTMLInputElement;
const video = document.getElementById("video") as HTMLVideoElement;
const inputCanvas = document.getElementById("inputCanvas") as HTMLCanvasElement;
const outputCanvas = document.getElementById(
	"outputCanvas"
) as HTMLCanvasElement;

// Get the 2D contexts
const inputCtx = inputCanvas.getContext("2d")!;
const outputCtx = outputCanvas.getContext("2d")!;

// Variables for motion detection
let prevFrameData: Uint8ClampedArray | null = null;
const blockSize = 10; // Size of each block (10x10 pixels)

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
		outputCanvas.width = video.videoWidth;
		outputCanvas.height = video.videoHeight;
	}
});

// Function to draw bounding box around a detected motion area
function drawBoundingBox(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number
) {
	ctx.beginPath();
	ctx.rect(x, y, width, height);
	ctx.lineWidth = 2;
	ctx.strokeStyle = "red"; // Change box color here
	ctx.stroke();
}

// Motion detection function with block-based approach
function detectMotionInBlocks(
	currentFrameData: Uint8ClampedArray,
	threshold: number
): Array<any> {
	const boxes: Array<any> = [];
	const width = video.videoWidth;
	const height = video.videoHeight;
	const blockWidth = Math.floor(width / blockSize);
	const blockHeight = Math.floor(height / blockSize);

	// Loop through each block to detect changes
	for (let by = 0; by < blockHeight; by++) {
		for (let bx = 0; bx < blockWidth; bx++) {
			const blockX = bx * blockSize;
			const blockY = by * blockSize;
			let motionDetected = false;

			// Check all pixels in this block
			for (let y = 0; y < blockSize; y++) {
				for (let x = 0; x < blockSize; x++) {
					const currentPixelX = blockX + x;
					const currentPixelY = blockY + y;

					if (currentPixelX >= width || currentPixelY >= height)
						continue;

					const offset = (currentPixelY * width + currentPixelX) * 4;
					if (prevFrameData) {
						// Calculate pixel difference (compare current and previous frame)
						const rDiff = Math.abs(
							currentFrameData[offset] - prevFrameData[offset]
						);
						const gDiff = Math.abs(
							currentFrameData[offset + 1] -
								prevFrameData[offset + 1]
						);
						const bDiff = Math.abs(
							currentFrameData[offset + 2] -
								prevFrameData[offset + 2]
						);

						// If any pixel in the block has significant change, mark block as moving
						const diff = (rDiff + gDiff + bDiff) / 3; // Average color difference

						if (diff > threshold) {
							motionDetected = true;
							break;
						}
					}
				}
				if (motionDetected) break;
			}

			// If motion is detected in the block, draw bounding box
			if (motionDetected) {
				boxes.push({
					x: blockX,
					y: blockY,
					width: blockSize,
					height: blockSize,
				});
			}
		}
	}

	return boxes;
}

// Render loop
function render(): void {
	if (video.paused || video.ended) return;

	// Draw the video frame to the input canvas
	inputCtx.drawImage(video, 0, 0, inputCanvas.width, inputCanvas.height);

	// Get pixel data from the current frame
	const currentFrameData = inputCtx.getImageData(
		0,
		0,
		inputCanvas.width,
		inputCanvas.height
	).data;

	// If we have a previous frame, detect motion
	if (prevFrameData) {
		// Detect motion and get bounding boxes
		const boxes = detectMotionInBlocks(currentFrameData, 30); // Adjust threshold as needed

		// Clear the output canvas
		outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

		// Draw bounding boxes around moving objects
		boxes.forEach((box) => {
			drawBoundingBox(outputCtx, box.x, box.y, box.width, box.height);
		});
	}

	// Store the current frame data for the next frame comparison
	prevFrameData = currentFrameData.slice();

	// Continue rendering the next frame
	requestAnimationFrame(render);
}

// Start rendering when the video is ready to play
video.addEventListener("play", () => {
	render();
});
