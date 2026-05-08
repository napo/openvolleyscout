import type { ReactNode } from 'react';
import type { FormattedMatchResult } from '../model/match-result-format';

interface MatchResultDisplayProps {
  result: FormattedMatchResult;
  goldenSetLabel: string;
  className?: string;
}

function WinnerValue({
  shouldBold,
  children,
}: {
  shouldBold: boolean;
  children: ReactNode;
}) {
  return shouldBold ? <strong>{children}</strong> : <span>{children}</span>;
}

export function MatchResultDisplay({ result, goldenSetLabel, className }: MatchResultDisplayProps) {
  if (!result.hasResult) {
    return null;
  }

  return (
    <span className={className}>
      <WinnerValue shouldBold={result.shouldBoldHomeSetScore}>{result.homeSetsWon}</WinnerValue>
      <span>-</span>
      <WinnerValue shouldBold={result.shouldBoldAwaySetScore}>{result.awaySetsWon}</WinnerValue>
      {result.setScores.length > 0 ? (
        <>
          <span> (</span>
          {result.setScores.map((setScore, index) => (
            <span key={setScore.setNumber}>
              {index > 0 ? ', ' : ''}
              {setScore.homeScore}-{setScore.awayScore}
            </span>
          ))}
          <span>)</span>
        </>
      ) : null}
      {result.goldenSetScore ? (
        <>
          <span> - {goldenSetLabel} </span>
          <WinnerValue shouldBold={result.shouldBoldGoldenHomeScore}>
            {result.goldenSetScore.homeScore}
          </WinnerValue>
          <span>-</span>
          <WinnerValue shouldBold={result.shouldBoldGoldenAwayScore}>
            {result.goldenSetScore.awayScore}
          </WinnerValue>
        </>
      ) : null}
    </span>
  );
}
