#!/usr/bin/env python3
"""
Analyze compression ratios for IT-compliance.txt chunks.
Calculates compression percentage for each chunk and overall statistics.
"""

import json

# Load the chunks data from the JSON file we fetched earlier
with open('/tmp/chunks-output.json', 'r') as f:
    chunks = json.load(f)

print("=" * 80)
print("COMPRESSION RATIO ANALYSIS: IT-compliance.txt")
print("=" * 80)
print()

# Calculate compression ratios for each chunk
total_original_chars = 0
total_compressed_chars = 0
chunk_ratios = []

print(f"{'Chunk':<8} {'Original':<12} {'Compressed':<12} {'Reduction':<12} {'Ratio %':<10}")
print("-" * 80)

for chunk in chunks:
    chunk_idx = chunk['chunk_index']
    original_len = len(chunk['chunk_text'])
    compressed_len = len(chunk['description'])

    # Calculate reduction and ratio
    reduction = original_len - compressed_len
    ratio_percent = (reduction / original_len * 100) if original_len > 0 else 0

    # Track totals
    total_original_chars += original_len
    total_compressed_chars += compressed_len
    chunk_ratios.append(ratio_percent)

    # Print row
    chunk_type = "Overview" if chunk_idx == 0 else f"Detail"
    print(f"{chunk_idx:<8} {original_len:<12,} {compressed_len:<12,} {reduction:<12,} {ratio_percent:>8.2f}%")

print("-" * 80)

# Calculate overall statistics
overall_reduction = total_original_chars - total_compressed_chars
overall_ratio = (overall_reduction / total_original_chars * 100) if total_original_chars > 0 else 0
avg_ratio = sum(chunk_ratios) / len(chunk_ratios) if chunk_ratios else 0
min_ratio = min(chunk_ratios) if chunk_ratios else 0
max_ratio = max(chunk_ratios) if chunk_ratios else 0

print(f"{'TOTAL':<8} {total_original_chars:<12,} {total_compressed_chars:<12,} {overall_reduction:<12,} {overall_ratio:>8.2f}%")
print()

# Print summary statistics
print("=" * 80)
print("SUMMARY STATISTICS")
print("=" * 80)
print()
print(f"Total chunks:           {len(chunks)}")
print(f"Overview chunk (0):     1")
print(f"Detail chunks (1-15):   {len(chunks) - 1}")
print()
print(f"Original total:         {total_original_chars:,} chars")
print(f"Compressed total:       {total_compressed_chars:,} chars")
print(f"Total reduction:        {overall_reduction:,} chars")
print()
print(f"Overall compression:    {overall_ratio:.2f}%")
print(f"Average per chunk:      {avg_ratio:.2f}%")
print(f"Best compression:       {max_ratio:.2f}% (chunk {chunk_ratios.index(max_ratio)})")
print(f"Worst compression:      {min_ratio:.2f}% (chunk {chunk_ratios.index(min_ratio)})")
print()

# Breakdown by chunk type
overview_ratio = chunk_ratios[0]
detail_ratios = chunk_ratios[1:]
avg_detail_ratio = sum(detail_ratios) / len(detail_ratios) if detail_ratios else 0

print("=" * 80)
print("BREAKDOWN BY CHUNK TYPE")
print("=" * 80)
print()
print(f"Overview (chunk 0):     {overview_ratio:.2f}%")
print(f"Detail chunks avg:      {avg_detail_ratio:.2f}%")
print()

# Calculate quartiles for detail chunks
sorted_detail = sorted(detail_ratios)
n = len(sorted_detail)
q1_idx = n // 4
q2_idx = n // 2
q3_idx = 3 * n // 4

print(f"Detail chunks distribution:")
print(f"  Q1 (25th percentile):  {sorted_detail[q1_idx]:.2f}%")
print(f"  Q2 (50th percentile):  {sorted_detail[q2_idx]:.2f}%")
print(f"  Q3 (75th percentile):  {sorted_detail[q3_idx]:.2f}%")
print()

# Identify outliers (chunks with compression < 70% or > 90%)
print("=" * 80)
print("OUTLIERS (< 70% or > 90% compression)")
print("=" * 80)
print()

outliers_found = False
for i, ratio in enumerate(chunk_ratios):
    if ratio < 70 or ratio > 90:
        outliers_found = True
        chunk_type = "Overview" if i == 0 else "Detail"
        original_len = len(chunks[i]['chunk_text'])
        compressed_len = len(chunks[i]['description'])
        print(f"Chunk {i} ({chunk_type}): {ratio:.2f}% compression")
        print(f"  Original:    {original_len:,} chars")
        print(f"  Compressed:  {compressed_len:,} chars")
        print(f"  Reduction:   {original_len - compressed_len:,} chars")
        print()

if not outliers_found:
    print("No outliers found. All chunks between 70-90% compression.")
    print()

print("=" * 80)
print("ANALYSIS COMPLETE")
print("=" * 80)
