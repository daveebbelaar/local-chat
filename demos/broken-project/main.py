from invoices import total

amounts = ["1.234,56", "89,90", "12,00", "2.500,00"]
result = total(amounts)
print(f"Total: {result:.2f}")
assert abs(result - 3836.46) < 0.001, f"Expected 3836.46, got {result}"
print("OK")
