# Demo 2: speculative decoding

The same 27B model twice. The `-mtp` version has extra multi-token prediction heads: it guesses several tokens
ahead, and the full model checks the guesses in one pass. When the guesses are right, you get several tokens for the
price of one.

| Model | File |
| --- | --- |
| `qwen3.8:27b-q4_K_M` | 17.7 GB |
| `qwen3.8:27b-mtp-q4_K_M` | 17.7 GB |

## Steps

1. Settings: temperature `0`.
2. New chat, pick `qwen3.8:27b-q4_K_M`, thinking `Off`. Paste the edit prompt below.
3. New chat, pick `qwen3.8:27b-mtp-q4_K_M`, thinking `Off`. Paste the same prompt.
4. Compare tok/s. Then ask both a normal question, such as "What causes the seasons on Earth? Answer in about 150
   words.", and compare again.

An edit repeats most of the input, so the guesses are almost always right and the speed-up is large. A fresh answer
is harder to guess, so the speed-up is small.

## Edit prompt

````text
Change the late fee from 2% to 3% per week. Return the whole function, nothing else.

```python
from datetime import date


def invoice_total(lines, issued, paid=None, country="NL", discount_code=None):
    """Return the amount due for an invoice, including VAT and late fees."""
    vat_rates = {"NL": 0.21, "DE": 0.19, "BE": 0.21, "FR": 0.20}
    if country not in vat_rates:
        raise ValueError(f"Unknown country: {country}")

    subtotal = 0.0
    for line in lines:
        quantity = line.get("quantity", 1)
        price = line["price"]
        if quantity <= 0 or price < 0:
            raise ValueError(f"Invalid line: {line}")
        subtotal += quantity * price

    if discount_code == "WELCOME10":
        subtotal *= 0.90
    elif discount_code == "PARTNER20":
        subtotal *= 0.80
    elif discount_code is not None:
        raise ValueError(f"Unknown discount code: {discount_code}")

    vat = subtotal * vat_rates[country]
    total = subtotal + vat

    paid_on = paid or date.today()
    days_late = (paid_on - issued).days - 30
    if days_late > 0:
        weeks_late = days_late // 7 + 1
        late_fee = total * 0.02 * weeks_late
        total += min(late_fee, total * 0.10)

    return round(total, 2)
```
````

## Measured

MacBook Pro M3 Max, 36 GB, Ollama 0.40.14, temperature 0, thinking off, one model loaded at a time, 8 November 2026:

| Prompt | `qwen3.8:27b-q4_K_M` | `qwen3.8:27b-mtp-q4_K_M` | Speed-up |
| --- | --- | --- | --- |
| One-line edit (352 tokens out, same answer) | 14.5 tok/s | 36.8 tok/s | 2.5x |
| Normal question (189 tokens out, same answer) | 14.6 tok/s | 24.6 tok/s | 1.7x |
