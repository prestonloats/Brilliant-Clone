// A standalone input-output table (x-values across the top row, the matching y-values below),
// with an optional caption. Reuses the .choice-table styling. Used to illustrate concepts.
export function ValueTable({ x, y, caption }: { x: number[]; y: number[]; caption?: string }) {
  return (
    <figure className="value-table">
      <table className="choice-table">
        <tbody>
          <tr>
            <th scope="row">x</th>
            {x.map((value, index) => (
              <td key={index}>{value}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">y</th>
            {y.map((value, index) => (
              <td key={index}>{value}</td>
            ))}
          </tr>
        </tbody>
      </table>
      {caption && <figcaption className="value-table-caption">{caption}</figcaption>}
    </figure>
  )
}
