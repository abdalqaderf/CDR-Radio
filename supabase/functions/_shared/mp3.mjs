export const maxUpload = 5 * 1024 * 1024

// Check an ID3v2 prefix and two consecutive MPEG Layer III frame headers.
// Successful codec decoding and provider processing are separate checks.
export function validMp3(name, type, bytes) {
  if (
    typeof name !== 'string' ||
    !/\.mp3$/i.test(name) ||
    name.length > 180 ||
    /[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(name) ||
    !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(type) ||
    bytes.length > maxUpload
  )
    return false
  let i = 0
  if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
    if (bytes.length < 10 || bytes[3] < 2 || bytes[3] > 4 || bytes.subarray(6, 10).some((n) => n > 127))
      return false
    i = 10 + bytes.subarray(6, 10).reduce((size, n) => size * 128 + n, 0)
    if (bytes[3] === 4 && bytes[5] & 16) i += 10
  }
  for (let frame = 0; frame < 2; frame++) {
    if (
      i + 4 > bytes.length ||
      bytes[i] !== 255 ||
      (bytes[i + 1] & 224) !== 224 ||
      (bytes[i + 1] & 6) !== 2
    )
      return false
    const version = (bytes[i + 1] >> 3) & 3
    if (version === 1) return false
    const rates =
      version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    const rate = rates[bytes[i + 2] >> 4]
    const hz =
      [44100, 48000, 32000][(bytes[i + 2] >> 2) & 3] / (version === 3 ? 1 : version === 2 ? 2 : 4)
    if (!rate || !hz) return false
    i += Math.floor(((version === 3 ? 144000 : 72000) * rate) / hz) + ((bytes[i + 2] >> 1) & 1)
    if (i > bytes.length) return false
  }
  return true
}
