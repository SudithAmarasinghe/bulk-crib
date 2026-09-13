import pandas as pd

data = {
    'ID_NUMBER': [
        '123/45-6789',    # P - slash removed -> becomes 12345-6789
        'ABC(123)456',    # N - parentheses removed
        'A-1234567',      # P - starts with letter -> PassportNumber
        '987654321',      # P - starts with number -> NIC
        'XYZ/789.012',    # N - slash and period removed
        'B 7654321',      # P - space removed -> PassportNumber
        '456,789,123',    # N - commas removed
        '741852963',      # P - already clean, no change
        'PQ\\9988776',    # P - backslash removed -> PassportNumber
        '123456789',      # P - clean NIC
        '12345 6789',     # P - space removed -> becomes 123456789 (DUPLICATE of above!)
        'DEF(456)',       # N - parentheses removed
        '',               # P - empty ID -> should be dropped
        '555666777',      # X - invalid type -> should be dropped
    ],
    'PERSONAL_NONPERSONAL': [
        'P', 'N', 'P', 'P', 'N', 'P', 'N', 'P', 'P', 'P', 'P', 'N', 'P', 'X'
    ],
    'CUSTOMER_NAME': [  # extra column - should be ignored
        'Silva', 'ABC Ltd', 'Perera', 'Fernando', 'XYZ Corp', 'Jayasinghe',
        'Delta Pvt', 'Bandara', 'Wickrama', 'Gunasekara', 'Rajapakse',
        'DEF Holdings', 'Empty Test', 'Invalid Test'
    ]
}

df = pd.DataFrame(data)
df.to_excel('sample_test_data.xlsx', index=False)
print(f"Created sample_test_data.xlsx with {len(df)} rows")