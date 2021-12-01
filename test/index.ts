import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
// eslint-disable-next-line node/no-missing-import
import { Crypto4You, TestToken } from "../typechain";
// eslint-disable-next-line node/no-missing-import
import { Campaign, generateCampaign } from "./util";

describe("Fee Percentage", () => {
  let instance: Crypto4You;
  let anotherAccount: SignerWithAddress;
  // Deploy the contract
  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    let owner: SignerWithAddress;
    [owner, anotherAccount] = await ethers.getSigners();
    instance = await Crypto4You.deploy(owner.address, 5000);
    await instance.deployed();
  });

  it("should update fee percentage correctly", async () => {
    const setFeePertcentageTx = await instance.setFeePercentage(1000);
    await setFeePertcentageTx.wait();

    expect(await instance.feePercentage()).to.equal(1000);
  });

  it("shouldn't update fee percentage greater than 10%", async () => {
    const setFeePertcentageTx = instance.setFeePercentage(1001);

    await expect(setFeePertcentageTx).to.be.revertedWith("Fee max is 10%");
  });

  it("shouldn't update fee percentage if not owner", async () => {
    const setFeePertcentageTx = instance
      .connect(anotherAccount)
      .setFeePercentage(1000);

    await expect(setFeePertcentageTx).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});

describe("Executor Update", () => {
  let instance: Crypto4You;
  let anotherExecutor: SignerWithAddress;
  // Deploy the contract
  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    let owner: SignerWithAddress;
    [owner, anotherExecutor] = await ethers.getSigners();
    instance = await Crypto4You.deploy(owner.address, 5000);
    await instance.deployed();
  });

  it("should update the executor", async () => {
    const updateExecutorTx = await instance.updateExecutor(
      anotherExecutor.address
    );
    await updateExecutorTx.wait();

    expect(await instance.executor()).to.equal(anotherExecutor.address);
  });

  it("shouldn't update executor if not owner", async () => {
    const updateExecutorTx = instance
      .connect(anotherExecutor)
      .updateExecutor(anotherExecutor.address);

    await expect(updateExecutorTx).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});

describe("Create Campaign", () => {
  let instance: Crypto4You;
  let executor: SignerWithAddress;
  let creator: SignerWithAddress;
  let erc20: TestToken;
  let campaignId: number;
  let feePercentage: number;
  let campaign: Campaign;

  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    [, executor, creator] = await ethers.getSigners();

    instance = await Crypto4You.deploy(executor.address, 5000);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    campaignId = 0;
    feePercentage = (await instance.feePercentage()).toNumber();
  });

  beforeEach(async () => {
    campaign = generateCampaign(
      campaignId++,
      creator.address,
      erc20.address,
      feePercentage
    );
    const mintTx = await erc20.mint(creator.address, campaign.totalValue);
    await mintTx.wait();
  });
  it("should create campaign", async () => {
    const approveTx = await erc20
      .connect(creator)
      .approve(instance.address, campaign.totalValue);
    await approveTx.wait();

    const createCampaignTx = await instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.valuePerShare,
        campaign.totalValue
      );

    expect(createCampaignTx)
      .to.emit(instance, "CampaignCreated")
      .withArgs(
        campaign.id,
        campaign.tokenAddress,
        campaign.returningValuePerShare,
        campaign.totalValue
      );

    const createdCampaign = await instance.campaigns(campaign.id);
    expect(createdCampaign.creator).to.be.equal(campaign.creator);
    expect(createdCampaign.tokenAddress).to.be.equal(campaign.tokenAddress);
    expect(createdCampaign.totalValue).to.be.equal(campaign.totalValue);
    expect(createdCampaign.totalFees).to.be.equal(0);

    expect(createdCampaign.valuePerShare).to.be.equal(
      campaign.returningValuePerShare
    );
    expect(createdCampaign.feePerShare).to.be.equal(
      campaign.returningFeePerShare
    );
  });

  it("shouldn't create campaign if not approved", async () => {
    const createCampaignTx = instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.valuePerShare,
        campaign.totalValue
      );

    await expect(createCampaignTx).to.be.revertedWith(
      "ERC20: transfer amount exceeds allowance"
    );
  });
  it("shouldn't create campaign if invalid erc20 token address", async () => {
    const notERC20Address = (await ethers.getSigners())[3].address;

    const createCampaignTx = instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        notERC20Address,
        campaign.valuePerShare,
        campaign.totalValue
      );

    await expect(createCampaignTx).to.be.reverted;
  });
  it("shouldn't create campaign for non-erc20 token address", async () => {
    const createCampaignTx = instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        instance.address,
        campaign.valuePerShare,
        campaign.totalValue
      );

    await expect(createCampaignTx).to.be.reverted;
  });
  it("shouldn't create campaign if invalid value per share", async () => {
    const createCampaignTx = instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.totalValue,
        campaign.valuePerShare
      );

    await expect(createCampaignTx).to.be.revertedWith(
      "share must be less than Total"
    );
  });
  it("shouldn't create campaign if value per share is 0", async () => {
    const createCampaignTx = instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.totalValue,
        0
      );

    await expect(createCampaignTx).to.be.revertedWith("must be greater than 0");
    const createCampaignTx2 = instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        0,
        campaign.valuePerShare
      );

    await expect(createCampaignTx2).to.be.revertedWith(
      "must be greater than 0"
    );
  });
});

// describe("Fund Campaign", () => {
//   let instance: Crypto4You;
//   let creator: SignerWithAddress;
//   let erc20: TestToken;
//   let campaignId: number;
//   let feePercentage: number;
//   let campaign: Campaign;
//   before(async () => {
//     campaignId = 0;
//     const Crypto4You = await ethers.getContractFactory("Crypto4You");
//     const TestToken = await ethers.getContractFactory("TestToken");
//     let owner: SignerWithAddress;
//     [owner, creator] = await ethers.getSigners();

//     instance = await Crypto4You.deploy(owner.address, 5000);
//     await instance.deployed();

//     erc20 = await TestToken.deploy();
//     await erc20.deployed();

//     feePercentage = (await instance.feePercentage()).toNumber();
//   });
//   beforeEach(async () => {
//     campaign = generateCampaign(
//       campaignId++,
//       creator.address,
//       erc20.address,
//       feePercentage
//     );
//     const mintTx = await erc20.mint(creator.address, campaign.totalValue); // 21 million
//     await mintTx.wait();
//     const approveTx = await erc20
//       .connect(creator)
//       .approve(instance.address, campaign.totalValue);
//     await approveTx.wait();
//     const createCampaignTx = await instance
//       .connect(creator)
//       .createCampaign(
//         campaign.id,
//         campaign.tokenAddress,
//         campaign.valuePerShare,
//         campaign.totalValue
//       );
//     await createCampaignTx.wait();
//   });
//   it("should fund campaign", async () => {
//     const fundCampaignTx = await instance
//       .connect(creator)
//       .fundCampaign(campaign.id, campaign.totalValue);

//     expect(fundCampaignTx)
//       .to.emit(instance, "CampaignFunded")
//       .withArgs(campaign.id, campaign.totalValue);

//     const fundedCampaign = await instance.campaigns(campaign.id);
//     expect(fundedCampaign.totalFees).to.be.equal(
//       campaign.returningTotalFees
//     );
//     expect(fundedCampaign.valuePerShare).to.be.equal(
//       campaign.returningValuePerShare
//     );
//     expect(fundedCampaign.feePerShare).to.be.equal(
//       campaign.returningFeePerShare
//     );
//   });
// });

describe("Withdraw Campaign", () => {
  let instance: Crypto4You;
  let creator: SignerWithAddress;
  let erc20: TestToken;
  let campaignId: number;
  let feePercentage: number;
  let campaign: Campaign;
  before(async () => {
    campaignId = 0;
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    let owner: SignerWithAddress;
    [owner, creator] = await ethers.getSigners();

    instance = await Crypto4You.deploy(owner.address, 5000);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();
  });
  beforeEach(async () => {
    campaign = generateCampaign(
      campaignId++,
      creator.address,
      erc20.address,
      feePercentage
    );
    const mintTx = await erc20.mint(creator.address, campaign.totalValue); // 21 million
    await mintTx.wait();
    const approveTx = await erc20
      .connect(creator)
      .approve(instance.address, campaign.totalValue);
    await approveTx.wait();
    const createCampaignTx = await instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.valuePerShare,
        campaign.totalValue
      );
    await createCampaignTx.wait();
  });
  it("should withdraw funds from campaign", async () => {
    const balanceBefore = await erc20.balanceOf(creator.address);

    const withdrawValue = Math.floor(campaign.totalValue / 2);
    const withdrawCampaignTx = await instance
      .connect(creator)
      .withdrawFunds(campaign.id, withdrawValue);

    expect(withdrawCampaignTx)
      .to.emit(instance, "CampaignWithdrawn")
      .withArgs(campaign.id, withdrawValue);
    const balanceAfter = await erc20.balanceOf(creator.address);
    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.totalValue).to.be.equal(
      campaign.totalValue - withdrawValue
    );
    expect(balanceAfter).to.be.equal(balanceBefore.add(withdrawValue));
  });
  it("shouldn't withdraw funds if not creator", async () => {
    const withdrawValue = Math.floor(campaign.totalValue / 2);
    const withdrawCampaignTx = instance.withdrawFunds(
      campaign.id,
      withdrawValue
    );

    await expect(withdrawCampaignTx).to.be.revertedWith("Only creator");
  });
  it("should'n withdraw funds if withdraw value is 0", async () => {
    const withdrawValue = 0;
    const withdrawCampaignTx = instance
      .connect(creator)
      .withdrawFunds(campaign.id, withdrawValue);

    await expect(withdrawCampaignTx).to.be.revertedWith(
      "Value must be greater than 0"
    );
    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.totalValue).to.be.equal(campaign.totalValue);
  });
  it("should'n withdraw funds if withdraw value is greater than total value", async () => {
    const withdrawValue = campaign.totalValue + 1;
    const withdrawCampaignTx = instance
      .connect(creator)
      .withdrawFunds(campaign.id, withdrawValue);

    await expect(withdrawCampaignTx).to.be.revertedWith(
      "Withdraw value too high"
    );
    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.totalValue).to.be.equal(campaign.totalValue);
  });
  it("should withdraw funds without auto pause", async () => {
    const withdrawValue = campaign.totalValue - campaign.valuePerShare;
    const withdrawCampaignTx = instance
      .connect(creator)
      .withdrawFunds(campaign.id, withdrawValue);

    await expect(withdrawCampaignTx).to.not.emit(instance, "CampaignPaused");
    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.totalValue).to.be.equal(
      campaign.totalValue - withdrawValue
    );
    expect(campaignContract.paused).to.be.equal(false);
  });
  it("should withdraw funds with auto pause", async () => {
    const withdrawValue = campaign.totalValue - campaign.valuePerShare + 1;
    const withdrawCampaignTx = instance
      .connect(creator)
      .withdrawFunds(campaign.id, withdrawValue);

    await expect(withdrawCampaignTx)
      .to.emit(instance, "CampaignPaused")
      .withArgs(campaign.id);
    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.totalValue).to.be.equal(
      campaign.totalValue - withdrawValue
    );
    expect(campaignContract.paused).to.be.equal(true);
  });
});
describe("Pause Campaign", () => {
  let instance: Crypto4You;
  let creator: SignerWithAddress;
  let erc20: TestToken;
  let campaignId: number;
  let feePercentage: number;
  let campaign: Campaign;
  before(async () => {
    campaignId = 0;
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    let owner: SignerWithAddress;
    [owner, creator] = await ethers.getSigners();

    instance = await Crypto4You.deploy(owner.address, 5000);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();
  });
  beforeEach(async () => {
    campaign = generateCampaign(
      campaignId++,
      creator.address,
      erc20.address,
      feePercentage
    );
    const mintTx = await erc20.mint(creator.address, campaign.totalValue); // 21 million
    await mintTx.wait();
    const approveTx = await erc20
      .connect(creator)
      .approve(instance.address, campaign.totalValue);
    await approveTx.wait();
    const createCampaignTx = await instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.valuePerShare,
        campaign.totalValue
      );
    await createCampaignTx.wait();
  });
  it("should pause campaign", async () => {
    const pauseCampaignTx = await instance
      .connect(creator)
      .pauseCampaign(campaign.id);
    expect(pauseCampaignTx)
      .to.emit(instance, "CampaignPaused")
      .withArgs(campaign.id);
    const pausedCampaign = await instance.campaigns(campaign.id);
    expect(pausedCampaign.paused).to.be.equal(true);
  });
  it("shouldn't pause campaign if not creator", async () => {
    const pauseCampaignTx = instance.pauseCampaign(campaign.id);
    await expect(pauseCampaignTx).to.be.revertedWith("Only creator");
    const pausedCampaign = await instance.campaigns(campaign.id);
    expect(pausedCampaign.paused).to.be.equal(false);
  });
  it("shouldn't pause campaign if already paused", async () => {
    const tx1 = await instance.connect(creator).pauseCampaign(campaign.id);
    await tx1.wait();
    const pauseCampaignTx = instance
      .connect(creator)
      .pauseCampaign(campaign.id);
    await expect(pauseCampaignTx).to.be.revertedWith(
      "Campaign is already paused"
    );
    const pausedCampaign = await instance.campaigns(campaign.id);
    expect(pausedCampaign.paused).to.be.equal(true);
  });
});

describe("Resume campaign", () => {
  let instance: Crypto4You;
  let creator: SignerWithAddress;
  let erc20: TestToken;
  let campaignId: number;
  let feePercentage: number;
  let campaign: Campaign;
  before(async () => {
    campaignId = 0;
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    let owner: SignerWithAddress;
    [owner, creator] = await ethers.getSigners();

    instance = await Crypto4You.deploy(owner.address, 5000);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();
  });
  beforeEach(async () => {
    campaign = generateCampaign(
      campaignId++,
      creator.address,
      erc20.address,
      feePercentage
    );
    const mintTx = await erc20.mint(creator.address, campaign.totalValue); // 21 million
    await mintTx.wait();
    const approveTx = await erc20
      .connect(creator)
      .approve(instance.address, campaign.totalValue);
    await approveTx.wait();
    const createCampaignTx = await instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.valuePerShare,
        campaign.totalValue
      );
    await createCampaignTx.wait();
  });
  it("should resume campaign", async () => {
    const pauseCampaignTx = await instance
      .connect(creator)
      .pauseCampaign(campaign.id);
    await pauseCampaignTx.wait();
    const resumeCampaignTx = await instance
      .connect(creator)
      .resumeCampaign(campaign.id);
    expect(resumeCampaignTx)
      .to.emit(instance, "CampaignResumed")
      .withArgs(campaign.id);
    const pausedCampaign = await instance.campaigns(campaign.id);
    expect(pausedCampaign.paused).to.be.equal(false);
  });
  it("shouldn't resume campaign if not creator", async () => {
    const pauseCampaignTx = await instance
      .connect(creator)
      .pauseCampaign(campaign.id);
    await pauseCampaignTx.wait();
    const resumeCampaignTx = instance.resumeCampaign(campaign.id);
    await expect(resumeCampaignTx).to.be.revertedWith("Only creator");
    const pausedCampaign = await instance.campaigns(campaign.id);
    expect(pausedCampaign.paused).to.be.equal(true);
  });
  it("shouldn't resume campaign if already resumed", async () => {
    const resumeCampaignTx = instance
      .connect(creator)
      .resumeCampaign(campaign.id);
    await expect(resumeCampaignTx).to.be.revertedWith("Campaign is not paused");
    const pausedCampaign = await instance.campaigns(campaign.id);
    expect(pausedCampaign.paused).to.be.equal(false);
  });
  it("shouldn't resume campaign if not paused", async () => {
    const resumeCampaignTx = instance
      .connect(creator)
      .resumeCampaign(campaign.id);
    await expect(resumeCampaignTx).to.be.revertedWith("Campaign is not paused");
  });
  it("should'n resume if has no funds", async () => {
    const pauseCampaignTx = await instance
      .connect(creator)
      .pauseCampaign(campaign.id);
    await pauseCampaignTx.wait();
    const tx1 = await instance
      .connect(creator)
      .withdrawFunds(campaign.id, campaign.totalValue);
    await tx1.wait();

    const resumeCampaignTx = instance
      .connect(creator)
      .resumeCampaign(campaign.id);
    await expect(resumeCampaignTx).to.be.revertedWith("Campaign has no funds");
    const pausedCampaign = await instance.campaigns(campaign.id);
    expect(pausedCampaign.paused).to.be.equal(true);
  });
});

describe("Check tweets", () => {
  let instance: Crypto4You;
  let owner: SignerWithAddress;
  let creator: SignerWithAddress;
  let user: SignerWithAddress;
  let erc20: TestToken;
  let campaign: Campaign;
  let userIdCounter: number;

  before(async () => {
    userIdCounter = 0;
    const campaignId = 0;
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    [owner, creator, user] = await ethers.getSigners();

    instance = await Crypto4You.deploy(owner.address, 5000);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    const feePercentage = (await instance.feePercentage()).toNumber();

    campaign = generateCampaign(
      campaignId,
      creator.address,
      erc20.address,
      feePercentage
    );
    const mintTx = await erc20.mint(creator.address, campaign.totalValue); // 21 million
    await mintTx.wait();
    const approveTx = await erc20
      .connect(creator)
      .approve(instance.address, campaign.totalValue);
    await approveTx.wait();
    const createCampaignTx = await instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.valuePerShare,
        campaign.totalValue
      );
    await createCampaignTx.wait();
  });

  it("should check tweets", async () => {
    const balanceBefore = await erc20.balanceOf(user.address);
    const campaignBefore = await instance.campaigns(campaign.id);
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = await instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );

    expect(checkTweetTx)
      .to.emit(instance, "UserFunded")
      .withArgs(campaign.id, user.address, "tweet_url");

    const balanceAfter = await erc20.balanceOf(user.address);
    const campaignAfter = await instance.campaigns(campaign.id);
    expect(balanceAfter).to.be.equal(
      balanceBefore.add(campaign.returningValuePerShare)
    );
    expect(campaignAfter.totalValue).to.be.equal(
      campaignBefore.totalValue.sub(
        campaign.returningValuePerShare + campaign.returningFeePerShare
      )
    );
    expect(campaignAfter.totalFees).to.be.equal(
      campaignBefore.totalFees.add(campaign.returningFeePerShare)
    );
    const addressFunded = await instance.addressFunded(
      campaign.id,
      user.address
    );
    expect(addressFunded).to.be.equal(true);
    const userIdFunded = await instance.userIdFunded(campaign.id, userId);
    expect(userIdFunded).to.be.equal(true);
  });

  it("shouldn't check tweets by non executor", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance
      .connect(user)
      .checkTweet(campaign.id, user.address, userId, "tweet_url");

    await expect(checkTweetTx).to.be.revertedWith("Only executor");
  });

  it("shouldn't check tweets if campaign is not active", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      campaign.id + 1,
      user.address,
      userId,
      "tweet_url"
    );

    await expect(checkTweetTx).to.be.revertedWith("Campaign isn't created");
  });
  it("shouldn't check tweets if user id is empty", async () => {
    const checkTweetTx = instance.checkTweet(
      campaign.id,
      user.address,
      "",
      "tweet_url"
    );

    await expect(checkTweetTx).to.be.revertedWith("User Id can't be empty");
  });
  it("shouldn't check tweets if tweet url is empty", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      ""
    );

    await expect(checkTweetTx).to.be.revertedWith("Tweet URL can't be empty");
  });
  it("shouldn't check tweets if campaign is paused", async () => {
    const pauseCampaignTx = await instance
      .connect(creator)
      .pauseCampaign(campaign.id);
    await pauseCampaignTx.wait();

    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );

    await expect(checkTweetTx).to.be.revertedWith("Campaign is paused");
  });
});

// update value per share
// withdraw fees
// batches
