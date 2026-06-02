declare module 'simpleheat' {
  class SimpleHeat {
    constructor(canvas: HTMLCanvasElement | string);
    data(points: Array<[number, number, number]>): this;
    max(max: number): this;
    min(min: number): this;
    radius(radius: number, blur?: number): this;
    gradient(gradient: Record<number, string>): this;
    draw(minOpacity?: number): this;
  }

  export default SimpleHeat;
}
