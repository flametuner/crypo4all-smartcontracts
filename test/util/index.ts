// Generate Campaign with id and token address, and return random value per share, total value

export type Campaign = {
  id: number;
  creator: string;
  tokenAddress: string;
  totalValue: number;
  valuePerShare: number;
  returningValuePerShare: number;
  returningFeePerShare: number;
};

export const generateCampaign = (
  id: number,
  creator: string,
  tokenAddress: string,
  feePercentage: number,
  minValuePerShare: number = 100,
  minShares: number = 1
): Campaign => {
  const valuePerShare = minValuePerShare + Math.floor(Math.random() * 100000);
  const totalValue =
    valuePerShare * (minShares + Math.floor(Math.random() * 100));
  const returningFeePerShare = Math.floor(
    (feePercentage * valuePerShare) / 10000
  );
  return {
    id,
    creator,
    tokenAddress,
    totalValue,
    valuePerShare,
    returningValuePerShare: valuePerShare - returningFeePerShare,
    returningFeePerShare,
  };
};
