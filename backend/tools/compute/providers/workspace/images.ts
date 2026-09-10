import { processImage } from "../../../image/process";
import type { ProcessImageFn } from "../../core/types.ts";
export async function loadProcessImage(): Promise<ProcessImageFn> { return processImage; }
export function fallbackImageAttachment(bytes: Buffer, mimeType: string): { ok: true; data: string; mimeType: string; hints: string[] } | { ok: false; message: string } {
	const passthrough = ["image/png", "image/jpeg", "image/gif", "image/webp"];
	if (!passthrough.includes(mimeType)) {
		return { ok: false, message: "[Image omitted: " + mimeType + " requires conversion; the image resizer was not found.]" };
	}
	if (bytes.byteLength > 4_500_000) {
		return { ok: false, message: "[Image omitted: larger than the 4.5 MB inline-image limit and the image resizer was not found.]" };
	}
	return { ok: true, data: bytes.toString("base64"), mimeType, hints: [] };
}
