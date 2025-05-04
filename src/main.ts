const videoInput = document.getElementById("videoInput") as HTMLInputElement;
const video = document.getElementById("video") as HTMLVideoElement;
const inputCanvas = document.getElementById("inputCanvas") as HTMLCanvasElement;
const outputCanvas = document.getElementById(
	"outputCanvas"
) as HTMLCanvasElement;
const inputCtx = inputCanvas.getContext("2d", {
	willReadFrequently: true,
}) as CanvasRenderingContext2D;
const outputCtx = outputCanvas.getContext("2d") as CanvasRenderingContext2D;

videoInput.addEventListener("change", (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (!file) return;

	const url = URL.createObjectURL(file);
	video.src = url;

	video.addEventListener("loadedmetadata", () => {
		inputCanvas.width = outputCanvas.width = video.videoWidth;
		inputCanvas.height = outputCanvas.height = video.videoHeight;
		video.play();
		requestNextFrame();
	});
});

function requestNextFrame(): void {
	if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
		video.requestVideoFrameCallback(processFrame);
	} else {
		console.error(
			"requestVideoFrameCallback is not supported in this browser."
		);
	}
}

let previousFrame: ImageData | null = null;

function processFrame(
	now: DOMHighResTimeStamp,
	metadata: VideoFrameCallbackMetadata
): void {
	inputCtx.drawImage(video, 0, 0, inputCanvas.width, inputCanvas.height);

	const currentInputFrame: ImageData = inputCtx.getImageData(
		0,
		0,
		inputCanvas.width,
		inputCanvas.height
	);

	const processedFrame: ImageData = inputCtx.getImageData(
		0,
		0,
		inputCanvas.width,
		inputCanvas.height
	);

	if (previousFrame !== null) {
		for (let i = 0; i < currentInputFrame.data.length; i += 4) {
			const redDiff = currentInputFrame.data[i] - previousFrame.data[i];
			const greenDiff =
				currentInputFrame.data[i + 1] - previousFrame.data[i + 1];
			const blueDiff =
				currentInputFrame.data[i + 2] - previousFrame.data[i + 2];

			const avgDiff =
				Math.abs(redDiff) + Math.abs(greenDiff) + Math.abs(blueDiff);
			const clamped = Math.round(Math.min(255, avgDiff));

			if (clamped > 100) {
				processedFrame.data[i] = 255;
				processedFrame.data[i + 1] = 255;
				processedFrame.data[i + 2] = 255;
			} else {
				processedFrame.data[i] = 0;
				processedFrame.data[i + 1] = 0;
				processedFrame.data[i + 2] = 0;
			}

			processedFrame.data[i + 3] = 255;
		}

		outputCtx.putImageData(processedFrame, 0, 0);
	}

	previousFrame = currentInputFrame;

	if (!video.ended) {
		requestNextFrame();
	} else {
		console.log("Video processing complete.");
	}
}
