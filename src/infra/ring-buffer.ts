/**
 * Fixed-capacity ring buffer. When full, push overwrites the oldest element.
 */
export class RingBuffer<T> {
  private readonly arr: T[];
  private readonly capacity: number;
  private size = 0;
  private next = 0;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new Error("RingBuffer capacity must be >= 1");
    }
    this.capacity = capacity;
    this.arr = Array.from({ length: capacity });
  }

  /** Append a value; when at capacity, overwrites the oldest. */
  push(value: T): void {
    this.arr[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size += 1;
    }
  }

  /** Number of elements currently stored. */
  get length(): number {
    return this.size;
  }

  /** Elements in insertion order (oldest first). */
  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.next - this.size + i + this.capacity) % this.capacity;
      out.push(this.arr[idx]);
    }
    return out;
  }
}
