import base64
import json
import os
import sys
import tempfile

import av

# PyAV 19 removed the metadata_errors keyword that faster-whisper still passes.
# Keep the local runtime compatible without downloading another large wheel.
_av_open = av.open
def _compatible_av_open(*args, **kwargs):
    kwargs.pop('metadata_errors', None)
    return _av_open(*args, **kwargs)
av.open = _compatible_av_open

from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get('NARA_WHISPER_MODEL', 'small')
model = WhisperModel(MODEL_SIZE, device='cpu', compute_type='int8')
payload = json.load(sys.stdin)
raw = base64.b64decode(payload.get('audio', ''))
suffix = '.webm' if 'webm' in payload.get('mimeType', '') else '.wav'
with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
    handle.write(raw)
    filename = handle.name
try:
    segments, _ = model.transcribe(filename, language=None, beam_size=5, vad_filter=True)
    text = ' '.join(segment.text.strip() for segment in segments).strip()
    print(json.dumps({'text': text, 'provider': 'local-whisper', 'model': MODEL_SIZE}, ensure_ascii=False))
finally:
    try:
        os.unlink(filename)
    except OSError:
        pass
