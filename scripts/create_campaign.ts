import { randomBytes } from "crypto";
import { constants } from "ethers";
import { sha256 } from "ethers/lib/utils";
import { ethers } from "hardhat";

const contractAddress = process.env.CONTRACT_ADDRESS || "";

async function main() {
  console.log(`Creating campaign`);
  // We get the contract to deploy
  const Crypto4All = await ethers.getContractFactory("Crypto4All");
  const instance = Crypto4All.attach(contractAddress);

  const createTx = await instance.createCampaign(
    sha256(randomBytes(32)),
    constants.AddressZero,
    100,
    1000000,
    {
      value: 1000000,
    }
  );
  await createTx.wait();

  console.log("Created new capaingn tx hash:", createTx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
