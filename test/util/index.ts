import { sha256, toUtf8Bytes } from "ethers/lib/utils";

// Generate Campaign with id and token address, and return random value per share, total value
export type Campaign = {
  id: string;
  creator: string;
  tokenAddress: string;
  totalValue: number;
  valuePerShare: number;
  returningValuePerShare: number;
  returningFeePerShare: number;
};

export const generateCampaign = (
  id: string,
  creator: string,
  tokenAddress: string,
  feePercentage: number,
  minShares: number = 1,
  minValuePerShare: number = 100
): Campaign => {
  const valuePerShare = minValuePerShare + Math.floor(Math.random() * 100000);
  const totalValue =
    valuePerShare * (minShares + Math.floor(Math.random() * 100)) * 2;
  const returningFeePerShare = Math.floor(
    (feePercentage * valuePerShare) / 10000
  );
  return {
    id: sha256(toUtf8Bytes(id)),
    creator,
    tokenAddress,
    totalValue,
    valuePerShare,
    returningValuePerShare: valuePerShare - returningFeePerShare,
    returningFeePerShare,
  };
};
