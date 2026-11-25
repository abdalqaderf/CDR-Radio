"""Generate original MP3 listening markers. Requires Python 3 and lameenc 1.8.1."""
from array import array
from math import pi, sin
from pathlib import Path
import sys

import lameenc


def encode_marker(pulses, frequency):
    sample_rate = 44100
    samples = array("h")
    for i in range(6 * sample_rate):
        time = i / sample_rate
        beat = time % 1
        pulse = beat % 0.25
        # One low or two high notes every second, with a short fade at both ends.
        gain = max(0, min(1, pulse / 0.01, (0.17 - pulse) / 0.01))
        if beat >= pulses * 0.25:
            gain = 0
        samples.append(round(5000 * gain * sin(2 * pi * frequency * time)))
    if sys.byteorder != "little":
        samples.byteswap()
    encoder = lameenc.Encoder()
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_bit_rate(96)
    encoder.set_quality(2)
    return encoder.encode(samples.tobytes()) + encoder.flush()


if __name__ == "__main__":
    directory = Path(__file__).resolve().parents[1] / "tests" / "media"
    directory.mkdir(exist_ok=True, parents=True)
    for name, pulses, frequency in [("a-low-single", 1, 440), ("b-high-double", 2, 880)]:
        (directory / (name + ".mp3")).write_bytes(encode_marker(pulses, frequency))
