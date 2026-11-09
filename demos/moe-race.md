# Demo 1: mixture of experts

Two models of almost the same file size. One is dense, one is a mixture of experts.

| Model | File | Type |
| --- | --- | --- |
| `qwen3.8:27b-q4_K_M` | 17.7 GB | dense: all 27B weights work on every token |
| `qwen3:30b` | 18.6 GB | mixture of experts: about 3B of 30B weights work on each token |

## Steps

1. Settings: temperature `0`.
2. New chat, pick `qwen3.8:27b-q4_K_M`, thinking `Off`. Send the prompt below.
3. New chat, pick `qwen3:30b`. It always thinks; leave thinking on. Send the same prompt.
4. Compare the tok/s under both answers.

Picking another model unloads the previous one, so the two never share memory.

## Prompt

```text
Explain how a hash map works to a junior developer. Use about 150 words and one short Python example.
```

## Measured

MacBook Pro M3 Max, 36 GB, Ollama 0.40.14, temperature 0, one model loaded at a time, 8 November 2026:

| Model | tok/s | Tokens |
| --- | --- | --- |
| `qwen3.8:27b-q4_K_M` (dense, thinking off) | 14.5 | 245 |
| `qwen3:30b` (mixture of experts, always thinks) | 85.3 | 409 |

The bigger file is about six times faster, because each token only uses about 3B of its 30B weights. Your numbers
depend on your memory bandwidth.
