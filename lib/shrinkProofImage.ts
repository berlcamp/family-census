/**
 * Shrink a photo of a Voter's Certificate to a small grayscale image that is
 * still readable on screen (browser only).
 *
 * Long side 1280 px → ~60–150 KB as WebP (JPEG where the browser cannot encode
 * WebP). If the result is still over the target, quality and then size are
 * lowered step by step.
 */
const TARGET_BYTES = 150 * 1024
const STEPS: { side: number; quality: number }[] = [
  { side: 1280, quality: 0.6 },
  { side: 1280, quality: 0.45 },
  { side: 1100, quality: 0.45 },
  { side: 960, quality: 0.4 },
  { side: 800, quality: 0.35 }
]

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // Honours the EXIF rotation of phone photos.
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fall back below */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function shrinkProofImage(
  file: File
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a photo (JPG or PNG).')
  }
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await decode(file)
  } catch {
    throw new Error('This photo could not be opened. Try taking it again as JPG.')
  }
  const w0 = source.width
  const h0 = source.height
  if (!w0 || !h0) throw new Error('This photo could not be opened.')

  let best: { blob: Blob; width: number; height: number } | null = null
  for (const step of STEPS) {
    const scale = Math.min(1, step.side / Math.max(w0, h0))
    const width = Math.round(w0 * scale)
    const height = Math.round(h0 * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser cannot resize photos.')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, width, height)
    // Grayscale with a little extra contrast: smaller files, text stays sharp.
    // (Done by hand: Safari ignores ctx.filter.)
    const img = ctx.getImageData(0, 0, width, height)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const v = Math.max(0, Math.min(255, (y - 128) * 1.15 + 128))
      d[i] = d[i + 1] = d[i + 2] = v
    }
    ctx.putImageData(img, 0, 0)

    let blob = await encode(canvas, 'image/webp', step.quality)
    // Safari may hand back PNG when it cannot write WebP.
    if (!blob || blob.type !== 'image/webp') {
      blob = await encode(canvas, 'image/jpeg', step.quality + 0.1)
    }
    if (!blob) continue
    if (!best || blob.size < best.blob.size) best = { blob, width, height }
    if (blob.size <= TARGET_BYTES) break
  }
  if ('close' in source) source.close()
  if (!best) throw new Error('This photo could not be resized.')
  return best
}
