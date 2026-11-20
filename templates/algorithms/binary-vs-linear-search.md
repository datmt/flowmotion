## Why it exists

Linear search checks items one by one, while binary search needs a sorted list and halves the search range on every probe, so it needs far fewer comparisons on large inputs. Anyone looking up a value in a collection faces the choice: scan everything, or pay once to keep the data ordered and search it fast.

## How it works

**Step 1, "The race"** sets the task: find 64 in a sorted list of 15 numbers. A probe is one comparison with the target. Both lists hold the same values.

**Steps 2-4, "Linear"** start at index 0 and move right, one item per probe. Each probe rules out exactly one item, so 64 at index 12 costs 13 probes. In the worst case, or when the target is absent, linear search checks all n items.

**Steps 5-8, "Binary"** keep a range `[lo, hi]` and probe the middle, `mid = (lo + hi) / 2`. Because the list is sorted, one comparison tells which half cannot hold the target. At mid = 7, 34 < 64, so indexes 0-7 are discarded. At mid = 11, 58 < 64, so 8-11 go. At mid = 13, 71 > 64, so `hi` becomes 12. Then mid = 12 hits 64: 4 probes.

**Step 9, "13 probes vs 4"** is the takeaway: linear cost grows with n, binary cost grows with log2(n). For 1,000,000 sorted items binary search needs about 20 probes.

## What goes wrong

The branch **"What if it is not sorted?"** swaps 64 with 15. Now 64 sits at index 3. Binary search still probes mid = 7, sees 34 < 64, and discards indexes 0-7, which contain the target. It ends with `lo` past `hi` and reports "not found" although 64 is in the list. Linear search never assumes order, so it still finds 64, on probe 4.

Binary search is not a heuristic that degrades gracefully: on unsorted input it returns wrong answers, silently.

## In practice

- Linear search suits small lists, unsorted data, data you can only read in sequence (a stream, a linked list) and one-off lookups.
- Binary search suits sorted arrays you query many times. Sorting costs O(n log n) once, then each lookup is O(log n); for a single lookup, sorting first is slower than a scan.
- Most standard libraries ship a binary search for sorted arrays; use it instead of rewriting it.

```ts
function binarySearch(a: number[], t: number): number {
  let lo = 0, hi = a.length - 1;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (a[mid] === t) return mid;
    if (a[mid] < t) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}
```

## Pitfalls

- Searching unsorted data with binary search gives wrong results, not an error.
- Writing `(lo + hi) / 2` can overflow in fixed-width integer languages; `lo + (hi - lo) / 2` avoids it.
- Off-by-one errors in `lo`, `hi` and the loop condition are the usual bug; test empty, one-item and absent-target cases.
- Binary search needs random access. On a linked list each jump costs O(n), which erases the benefit.
- Don't sort just to search once; a linear scan is cheaper.

## Further reading

- [Binary search algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Binary_search_algorithm)
- [Linear search (Wikipedia)](https://en.wikipedia.org/wiki/Linear_search)
