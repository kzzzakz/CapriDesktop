/** Share overlapping reads, briefly reuse completed snapshots, and back off after failures. */
export class AsyncSnapshot<T> {
  private value?: T
  private valid = false
  private expires = 0
  private pending?: Promise<T>
  private error: unknown
  private retryAt = 0
  private generation = 0
  constructor(private load: () => Promise<T>, private ttl: number, private retryDelay = 2000, private now = () => Date.now()) {}
  get(): Promise<T> {
    if (this.pending) return this.pending
    if (this.valid && this.now() < this.expires) return Promise.resolve(this.value!)
    if (this.now() < this.retryAt) return Promise.reject(this.error)
    const generation = this.generation
    const request = Promise.resolve().then(this.load).then(value => {
      if (generation !== this.generation) throw new Error('Desktop snapshot invalidated.')
      this.value = value; this.valid = true; this.expires = this.now() + this.ttl
      this.error = undefined; this.retryAt = 0
      return value
    }, error => {
      if (generation === this.generation) { this.valid = false; this.error = error; this.retryAt = this.now() + this.retryDelay }
      throw error
    }).finally(() => { if (this.pending === request) this.pending = undefined })
    this.pending = request
    return request
  }
  invalidate(): void {
    this.generation++; this.valid = false; this.value = undefined
    this.expires = 0; this.retryAt = 0; this.error = undefined; this.pending = undefined
  }
}
