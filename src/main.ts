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
const blockSize = 5; // Size of each block (10x10 pixels)

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
): void {
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
): boolean[][] {
	const width = video.videoWidth;
	const height = video.videoHeight;
	const blockWidth = Math.floor(width / blockSize);
	const blockHeight = Math.floor(height / blockSize);

	// Create an array to track the motion blocks
	const motionBlocks: boolean[][] = Array(blockHeight)
		.fill(null)
		.map(() => Array(blockWidth).fill(false));

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

			// Mark the block as having motion
			if (motionDetected) {
				motionBlocks[by][bx] = true;
			}
		}
	}

	return motionBlocks;
}

// Function to group adjacent moving blocks and get the bounding boxes
function getBoundingBoxes(
	motionBlocks: boolean[][]
): Array<{ x: number; y: number; width: number; height: number }> {
	const boxes: Array<{
		x: number;
		y: number;
		width: number;
		height: number;
	}> = [];
	const visited: boolean[][] = motionBlocks.map((row) =>
		row.map(() => false)
	);

	// Helper function to find the bounds of a connected component (group of moving blocks)
	function findBounds(
		x: number,
		y: number
	): { minX: number; minY: number; maxX: number; maxY: number } {
		let minX = x,
			minY = y,
			maxX = x,
			maxY = y;

		// Depth-first search to group connected blocks
		const stack: { x: number; y: number }[] = [{ x, y }];
		visited[y][x] = true;

		while (stack.length > 0) {
			const { x, y } = stack.pop()!;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);

			// Check neighboring blocks (up, down, left, right)
			const neighbors = [
				{ x: x + 1, y },
				{ x: x - 1, y },
				{ x, y: y + 1 },
				{ x, y: y - 1 },
			];

			// Add unvisited and moving neighbors to the stack
			for (const { x: nx, y: ny } of neighbors) {
				if (
					nx >= 0 &&
					ny >= 0 &&
					nx < motionBlocks[0].length &&
					ny < motionBlocks.length &&
					motionBlocks[ny][nx] &&
					!visited[ny][nx]
				) {
					visited[ny][nx] = true;
					stack.push({ x: nx, y: ny });
				}
			}
		}

		return { minX, minY, maxX, maxY };
	}

	// Find all connected motion blocks and group them into bounding boxes
	for (let y = 0; y < motionBlocks.length; y++) {
		for (let x = 0; x < motionBlocks[y].length; x++) {
			if (motionBlocks[y][x] && !visited[y][x]) {
				// Find the bounding box for this group of blocks
				const bounds = findBounds(x, y);
				boxes.push({
					x: bounds.minX * blockSize,
					y: bounds.minY * blockSize,
					width: (bounds.maxX - bounds.minX + 1) * blockSize,
					height: (bounds.maxY - bounds.minY + 1) * blockSize,
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
		// Detect motion and get blocks with significant motion
		const motionBlocks = detectMotionInBlocks(currentFrameData, 30); // Adjust threshold as needed

		// Get bounding boxes for moving objects
		const boxes = getBoundingBoxes(motionBlocks);

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
