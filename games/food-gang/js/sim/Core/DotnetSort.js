// List<T>.Sort(Comparison<T>) of .NET 8 (ArraySortHelper<T>.IntrospectiveSort). It is not stable, so a stable
// JS sort would order equal keys (e.g. contacts at the same distance) differently from the C# sim.

const SIZE_THRESHOLD = 16;

function swap(a, i, j) {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}

function swapIfGreater(a, lo, cmp, i, j) {
  if (cmp(a[lo + i], a[lo + j]) > 0) swap(a, lo + i, lo + j);
}

function insertionSort(a, lo, n, cmp) {
  for (let i = 0; i < n - 1; i++) {
    const t = a[lo + i + 1];
    let j = i;
    while (j >= 0 && cmp(t, a[lo + j]) < 0) {
      a[lo + j + 1] = a[lo + j];
      j--;
    }
    a[lo + j + 1] = t;
  }
}

function downHeap(a, lo, i, n, cmp) {
  const d = a[lo + i - 1];
  while (i <= n >> 1) {
    let child = 2 * i;
    if (child < n && cmp(a[lo + child - 1], a[lo + child]) < 0) child++;
    if (!(cmp(d, a[lo + child - 1]) < 0)) break;
    a[lo + i - 1] = a[lo + child - 1];
    i = child;
  }
  a[lo + i - 1] = d;
}

function heapSort(a, lo, n, cmp) {
  for (let i = n >> 1; i >= 1; i--) downHeap(a, lo, i, n, cmp);
  for (let i = n; i > 1; i--) {
    swap(a, lo, lo + i - 1);
    downHeap(a, lo, 1, i - 1, cmp);
  }
}

function pickPivotAndPartition(a, lo, n, cmp) {
  const hi = n - 1;
  const middle = hi >> 1;
  swapIfGreater(a, lo, cmp, 0, middle);
  swapIfGreater(a, lo, cmp, 0, hi);
  swapIfGreater(a, lo, cmp, middle, hi);
  const pivot = a[lo + middle];
  swap(a, lo + middle, lo + hi - 1);
  let left = 0, right = hi - 1;
  while (left < right) {
    while (cmp(a[lo + ++left], pivot) < 0);
    while (cmp(pivot, a[lo + --right]) < 0);
    if (left >= right) break;
    swap(a, lo + left, lo + right);
  }
  if (left !== hi - 1) swap(a, lo + left, lo + hi - 1);
  return left;
}

function introSort(a, lo, n, depthLimit, cmp) {
  let size = n;
  while (size > 1) {
    if (size <= SIZE_THRESHOLD) {
      if (size === 2) { swapIfGreater(a, lo, cmp, 0, 1); return; }
      if (size === 3) {
        swapIfGreater(a, lo, cmp, 0, 1);
        swapIfGreater(a, lo, cmp, 0, 2);
        swapIfGreater(a, lo, cmp, 1, 2);
        return;
      }
      insertionSort(a, lo, size, cmp);
      return;
    }
    if (depthLimit === 0) { heapSort(a, lo, size, cmp); return; }
    depthLimit--;
    const p = pickPivotAndPartition(a, lo, size, cmp);
    introSort(a, lo + p + 1, size - (p + 1), depthLimit, cmp);
    size = p;
  }
}

/** Sorts `a` in place exactly as .NET's List<T>.Sort(Comparison<T>) would. */
export function dotnetSort(a, cmp) {
  if (a.length > 1) introSort(a, 0, a.length, 2 * (Math.floor(Math.log2(a.length)) + 1), cmp);
  return a;
}

/** float.CompareTo / int.CompareTo */
export function compareNum(x, y) {
  if (x < y) return -1;
  if (x > y) return 1;
  if (x === y) return 0;
  return Number.isNaN(x) ? (Number.isNaN(y) ? 0 : -1) : 1;
}
