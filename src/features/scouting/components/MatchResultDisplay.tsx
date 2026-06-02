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
  return shouldBold ? <strong style={{ fontWeight: 700 }}>{children}</strong> : <span>{children}</span>;
}

export function MatchResultDisplay({ result, goldenSetLabel, className }: MatchResultDisplayProps) {
  if (!result.hasResult) {
    return null;
  }

  return (
    <span className={`match-result-display ${className || ''}`}>
      {(result.shouldBoldHomeSetScore || result.shouldBoldAwaySetScore) ? (
        <strong style={{ fontWeight: 700 }}>
          {result.homeSetsWon}-{result.awaySetsWon}
        </strong>
      ) : (
        <>
          {result.homeSetsWon}
          <span>-</span>
          {result.awaySetsWon}
        </>
      )}
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
