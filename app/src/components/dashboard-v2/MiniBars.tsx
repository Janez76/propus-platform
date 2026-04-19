interface MiniBarsProps {
  data: number[];
  height?: number;
}

export function MiniBars({ data, height = 36 }: MiniBarsProps) {
  const max = Math.max(...data, 1);
  return (
    <div className="dv2-minibars" style={{ height }}>
      {data.map((v, i) => (
        <div
          key={i}
          className={i === data.length - 1 ? "dv2-minibar dv2-minibar--current" : "dv2-minibar"}
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}
