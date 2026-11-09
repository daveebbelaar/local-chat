def parse_amount(text):
    """Turn a European amount such as '1.234,56' into 1234.56."""
    return float(text.replace(",", "."))


def total(amounts):
    return sum(parse_amount(amount) for amount in amounts)
