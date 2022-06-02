import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { randomUUID } from "crypto";
import { constants } from "ethers";
import { sha256, toUtf8Bytes } from "ethers/lib/utils";
import { ethers, waffle } from "hardhat";
// eslint-disable-next-line node/no-missing-import
import { Crypto4You, TestToken } from "../typechain";
// eslint-disable-next-line node/no-missing-import
import { Campaign, generateCampaign } from "./util";

const provider = waffle.provider;

describe("Contract Management", () => {
  let instance: Crypto4You;
  let anotherAccount: SignerWithAddress;
  // Deploy the contract
  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    let owner: SignerWithAddress;
    [owner, anotherAccount] = await ethers.getSigners();
    instance = await Crypto4You.deploy(owner.address, 500);
    await instance.deployed();
  });

  // FEE PERCENTAGE

  it("should update fee percentage correctly", async () => {
    const setFeePertcentageTx = await instance.setFeePercentage(1000);
    await setFeePertcentageTx.wait();

    expect(await instance.feePercentage()).to.equal(1000);
  });

  it("shouldn't update fee percentage greater than 20%", async () => {
    const setFeePertcentageTx = instance.setFeePercentage(2001);

    await expect(setFeePertcentageTx).to.be.revertedWith("Fee max is 20%");
  });

  it("shouldn't update fee percentage if not owner", async () => {
    const setFeePertcentageTx = instance
      .connect(anotherAccount)
      .setFeePercentage(1000);

    await expect(setFeePertcentageTx).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  // EXECUTOR UPDATE
  it("should update the executor", async () => {
    const updateExecutorTx = await instance.updateExecutor(
      anotherAccount.address
    );
    await updateExecutorTx.wait();

    expect(await instance.executor()).to.equal(anotherAccount.address);
  });

  it("shouldn't update executor if not owner", async () => {
    const updateExecutorTx = instance
      .connect(anotherAccount)
      .updateExecutor(anotherAccount.address);

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
  let feePercentage: number;
  let campaign: Campaign;

  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    [, executor, creator] = await ethers.getSigners();

    instance = await Crypto4You.deploy(executor.address, 500);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();
  });

  beforeEach(async () => {
    campaign = generateCampaign(
      randomUUID(),
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
  it("should create campaign with native token", async () => {
    const createCampaignTx = await instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        constants.AddressZero,
        campaign.valuePerShare,
        campaign.totalValue,
        {
          value: campaign.totalValue,
        }
      );

    expect(createCampaignTx)
      .to.emit(instance, "CampaignCreated")
      .withArgs(
        campaign.id,
        constants.AddressZero,
        campaign.returningValuePerShare,
        campaign.totalValue
      );
    expect(await provider.getBalance(instance.address)).to.be.equal(
      campaign.totalValue
    );
  });
  it("shouldn't create campaign if already created", async () => {
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
    const createCampaignAgainTx = instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        campaign.tokenAddress,
        campaign.valuePerShare,
        campaign.totalValue
      );
    await expect(createCampaignAgainTx).to.be.revertedWith(
      "Campaign already created"
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
  it("shouldn't create campaign with native token if total value different", async () => {
    const createCampaignTx = instance
      .connect(creator)
      .createCampaign(
        campaign.id,
        constants.AddressZero,
        campaign.valuePerShare,
        campaign.totalValue
      );

    await expect(createCampaignTx).to.be.revertedWith(
      "Different msg.value from _totalValue"
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
        campaign.totalValue + 1,
        campaign.totalValue
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

describe("Campaign Created", () => {
  let instance: Crypto4You;
  let creator: SignerWithAddress;
  let erc20: TestToken;
  let feePercentage: number;
  let campaign: Campaign;
  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    let owner: SignerWithAddress;
    [owner, creator] = await ethers.getSigners();

    instance = await Crypto4You.deploy(owner.address, 500);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();
  });
  beforeEach(async () => {
    campaign = generateCampaign(
      randomUUID(),
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
  // FUND
  it("should fund campaign", async () => {
    const campaignBefore = await instance.campaigns(campaign.id);
    const valueToFund = campaign.valuePerShare;
    const mintTx = await erc20.mint(creator.address, valueToFund); // 21 million
    await mintTx.wait();
    const approveTx = await erc20
      .connect(creator)
      .approve(instance.address, valueToFund);
    await approveTx.wait();
    const fundCampaignTx = await instance
      .connect(creator)
      .fundCampaign(campaign.id, valueToFund);

    expect(fundCampaignTx)
      .to.emit(instance, "CampaignFunded")
      .withArgs(campaign.id, valueToFund);

    const campaignAfter = await instance.campaigns(campaign.id);
    expect(campaignAfter.totalValue).to.be.equal(
      campaignBefore.totalValue.add(valueToFund)
    );
  });
  it("shouldn't fund campaign if not creator", async () => {
    const anotherAccount = (await ethers.getSigners())[3];
    const valueToFund = campaign.valuePerShare;
    const mintTx = await erc20.mint(anotherAccount.address, valueToFund); // 21 million
    await mintTx.wait();
    const approveTx = await erc20
      .connect(anotherAccount)
      .approve(instance.address, valueToFund);
    await approveTx.wait();
    const fundCampaignTx = instance
      .connect(anotherAccount)
      .fundCampaign(campaign.id, valueToFund);

    await expect(fundCampaignTx).to.be.revertedWith("Only creator");
  });

  it("shouldn't fund campaign if not approved", async () => {
    const valueToFund = campaign.valuePerShare;
    const mintTx = await erc20.mint(creator.address, valueToFund); // 21 million
    await mintTx.wait();
    const fundCampaignTx = instance
      .connect(creator)
      .fundCampaign(campaign.id, valueToFund);

    await expect(fundCampaignTx).to.be.reverted;
  });

  // WITHDRAW
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
  // PAUSE
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
  // RESUME
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
  // UPDATE VALUE PER SHARE
  it("should update value per share", async () => {
    const newValuePerShare = campaign.valuePerShare * 2;
    const updateValuePerShareTx = await instance
      .connect(creator)
      .updateValuePerShare(campaign.id, newValuePerShare);
    expect(updateValuePerShareTx)
      .to.emit(instance, "CampaignValuePerShareUpdated")
      .withArgs(campaign.id, newValuePerShare);
    const newFeePerShare = Math.floor(
      (feePercentage * newValuePerShare) / 10000
    );

    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.valuePerShare).to.be.equal(
      newValuePerShare - newFeePerShare
    );
    expect(campaignContract.feePerShare).to.be.equal(newFeePerShare);
  });
  it("shouldn't update value per share if value equal 0", async () => {
    const newValuePerShare = 0;
    const updateValuePerShareTx = instance
      .connect(creator)
      .updateValuePerShare(campaign.id, newValuePerShare);
    await expect(updateValuePerShareTx).to.be.revertedWith(
      "Value must be greater than 0"
    );
    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.valuePerShare).to.be.equal(
      campaign.returningValuePerShare
    );
  });
  it("shouldn't update the value per share if value greater than total value", async () => {
    const newValuePerShare = campaign.totalValue + 1;
    const updateValuePerShareTx = instance
      .connect(creator)
      .updateValuePerShare(campaign.id, newValuePerShare);
    await expect(updateValuePerShareTx).to.be.revertedWith(
      "Invalid Value per share"
    );
    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.valuePerShare).to.be.equal(
      campaign.returningValuePerShare
    );
  });
});

describe("Check tweets", () => {
  let instance: Crypto4You;
  let owner: SignerWithAddress;
  let creator: SignerWithAddress;
  let user: SignerWithAddress;
  let erc20: TestToken;
  let campaign: Campaign;
  let feePercentage: number;
  let userIdCounter: number = 0;

  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    [owner, creator, user] = await ethers.getSigners();

    instance = await Crypto4You.deploy(owner.address, 500);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();
  });

  beforeEach(async () => {
    campaign = generateCampaign(
      randomUUID(),
      creator.address,
      erc20.address,
      feePercentage,
      100
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
  it("shouldn't check tweets if user is 0x0", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      campaign.id,
      "0x0000000000000000000000000000000000000000",
      userId,
      "tweet_url"
    );

    await expect(checkTweetTx).to.revertedWith("User address must be valid");
  });

  it("shouldn't check tweets if campaign is not active", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      sha256(toUtf8Bytes(randomUUID())),
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
  it("shouldn't check tweets if user already funded", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );
    expect(checkTweetTx).to.emit(instance, "UserFunded");
    const userId2 = `random_id_${userIdCounter++}`;
    const checkTweetAgainTx = instance.checkTweet(
      campaign.id,
      user.address,
      userId2,
      "tweet_url"
    );
    await expect(checkTweetAgainTx).to.revertedWith("User already funded");
  });
  it("shouldn't check tweets if tweetUserId already funded", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );
    expect(checkTweetTx).to.emit(instance, "UserFunded");
    const user2 = (await ethers.getSigners())[3];
    const checkTweetAgainTx = instance.checkTweet(
      campaign.id,
      user2.address,
      userId,
      "tweet_url"
    );
    await expect(checkTweetAgainTx).to.revertedWith("Tweet already used");
  });
  // AUTO PAUSE
  it("should auto pause in check tweet if total value goes below value per share", async () => {
    const withdrawValue = campaign.totalValue - campaign.valuePerShare * 2 + 1;
    const withdrawTx = await instance
      .connect(creator)
      .withdrawFunds(campaign.id, withdrawValue);
    await withdrawTx.wait();
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );

    await expect(checkTweetTx)
      .to.emit(instance, "CampaignPaused")
      .withArgs(campaign.id);

    const campaignAfter = await instance.campaigns(campaign.id);
    expect(campaignAfter.paused).to.be.equal(true);
  });
  it("shouldn't auto pause in check tweet if total value goes above value per share", async () => {
    const withdrawValue = campaign.totalValue - campaign.valuePerShare * 2 - 1;
    const withdrawTx = await instance
      .connect(creator)
      .withdrawFunds(campaign.id, withdrawValue);
    await withdrawTx.wait();
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );

    await expect(checkTweetTx).to.not.emit(instance, "CampaignPaused");

    const campaignAfter = await instance.campaigns(campaign.id);
    expect(campaignAfter.paused).to.be.equal(false);
  });
  // BATCH TWEETS
  it("should check tweets in batch", async () => {
    const total = 10;
    const campaignIds = [];
    const userAddress = [];
    const usersIds = [];
    const tweetsUrls = [];

    for (let i = 0; i < total; i++) {
      const addr = (await ethers.getSigners())[10 + i].address;
      usersIds.push(`random_id_${userIdCounter++}`);
      userAddress.push(addr);
      tweetsUrls.push("tweet_url");
      campaignIds.push(campaign.id);
    }
    const checkTweetTx = await instance.batchCheckTweets(
      campaignIds,
      userAddress,
      usersIds,
      tweetsUrls
    );
    for (let i = 0; i < total; i++) {
      expect(checkTweetTx)
        .to.emit(instance, "UserFunded")
        .withArgs(campaign.id, userAddress[i], tweetsUrls[i]);
      const balance = await erc20.balanceOf(userAddress[i]);
      expect(balance).to.be.equal(campaign.returningValuePerShare);
    }
    const campaignAfter = await instance.campaigns(campaign.id);
    expect(campaignAfter.totalFees).to.be.equal(
      campaign.returningFeePerShare * total
    );
    expect(campaignAfter.totalValue).to.be.equal(
      campaign.totalValue - campaign.valuePerShare * total
    );
    expect(campaignAfter.totalFees).to.be.equal(
      campaign.returningFeePerShare * total
    );
  });
  it("shouldn't batch if different arrays length", async () => {
    const total = 3;
    const campaignIds = [];
    const userAddress = [];
    const usersIds = [];
    const tweetsUrls = [];

    for (let i = 0; i < total; i++) {
      const addr = (await ethers.getSigners())[10 + i].address;
      usersIds.push(`random_id_${userIdCounter++}`);
      userAddress.push(addr);
      tweetsUrls.push("tweet_url");
      campaignIds.push(campaign.id);
    }
    userAddress.pop();
    usersIds.pop();
    usersIds.pop();
    tweetsUrls.pop();
    tweetsUrls.pop();
    tweetsUrls.pop();
    const checkTweetTx = instance.batchCheckTweets(
      campaignIds,
      userAddress,
      usersIds,
      tweetsUrls
    );
    await expect(checkTweetTx).to.be.revertedWith("must have the same length");
  });
});
describe("Withdraw funds", () => {
  let instance: Crypto4You;
  let owner: SignerWithAddress;
  let creator: SignerWithAddress;
  let user: SignerWithAddress;
  let erc20: TestToken;
  let campaign: Campaign;
  let feePercentage: number;
  let userIdCounter: number = 0;

  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    [owner, creator, user] = await ethers.getSigners();

    instance = await Crypto4You.deploy(owner.address, 500);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();
  });

  beforeEach(async () => {
    campaign = generateCampaign(
      randomUUID(),
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
  it("should be able to withdraw fees", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = await instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );
    await checkTweetTx.wait();
    const campaignBefore = await instance.campaigns(campaign.id);
    const balanceBefore = await erc20.balanceOf(owner.address);
    expect(campaignBefore.totalFees.toNumber()).to.be.greaterThan(0);
    const withdrawFeesTx = await instance.withdrawFees(campaign.id);
    await withdrawFeesTx.wait();
    const campaignAfter = await instance.campaigns(campaign.id);
    const balanceAfter = await erc20.balanceOf(owner.address);
    expect(campaignAfter.totalFees).to.be.equal(0);
    expect(balanceAfter).to.be.equal(
      balanceBefore.add(campaignBefore.totalFees)
    );
  });
  it("shouldn't withdraw fees if not owner", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = await instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );
    await checkTweetTx.wait();
    const campaignBefore = await instance.campaigns(campaign.id);
    const balanceBefore = await erc20.balanceOf(creator.address);
    expect(campaignBefore.totalFees.toNumber()).to.be.greaterThan(0);
    const withdrawFeesTx = instance.connect(creator).withdrawFees(campaign.id);
    await expect(withdrawFeesTx).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
    const campaignAfter = await instance.campaigns(campaign.id);
    const balanceAfter = await erc20.balanceOf(creator.address);
    expect(campaignAfter.totalFees).to.be.equal(campaignBefore.totalFees);
    expect(balanceAfter).to.be.equal(balanceBefore);
  });
  it("shouldn't withdraw fees if fees are equal 0", async () => {
    const campaignBefore = await instance.campaigns(campaign.id);
    const balanceBefore = await erc20.balanceOf(owner.address);
    expect(campaignBefore.totalFees).to.be.equal(0);
    const withdrawFeesTx = instance.withdrawFees(campaign.id);
    await expect(withdrawFeesTx).to.be.revertedWith(
      "Fee must be greater than 0"
    );
    const campaignAfter = await instance.campaigns(campaign.id);
    const balanceAfter = await erc20.balanceOf(owner.address);
    expect(campaignAfter.totalFees).to.be.equal(campaignBefore.totalFees);
    expect(balanceAfter).to.be.equal(balanceBefore);
  });
  // BATCH WITHDRAW FEES
  it("should be able to batch withdraw fees", async () => {
    const total = 10;
    const campaignIds = [];
    const userAddress = [];
    const usersIds = [];
    const tweetsUrls = [];

    for (let i = 0; i < total; i++) {
      const campaign = generateCampaign(
        randomUUID(),
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
      userAddress.push(user.address);
      campaignIds.push(campaign.id);
      usersIds.push("random_id_0");
      tweetsUrls.push("tweet_url");
    }
    const batchCheckTweetsTx = await instance.batchCheckTweets(
      campaignIds,
      userAddress,
      usersIds,
      tweetsUrls
    );
    await batchCheckTweetsTx.wait();
    const batchWithdrawFeesTx = await instance.batchWithdrawFees(campaignIds);
    await batchWithdrawFeesTx.wait();
    for (let i = 0; i < total; i++) {
      const campaignAfter = await instance.campaigns(campaignIds[i]);
      expect(campaignAfter.totalFees).to.be.equal(0);
    }
  });
});
describe("Native token", () => {
  let instance: Crypto4You;
  let owner: SignerWithAddress;
  let creator: SignerWithAddress;
  let user: SignerWithAddress;
  let erc20: TestToken;
  let campaign: Campaign;
  let feePercentage: number;
  let userIdCounter: number = 0;

  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    [owner, creator, user] = await ethers.getSigners();

    instance = await Crypto4You.deploy(owner.address, 500);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();
  });
  beforeEach(async () => {
    campaign = generateCampaign(
      randomUUID(),
      creator.address,
      erc20.address,
      feePercentage,
      100
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
        constants.AddressZero,
        campaign.valuePerShare,
        campaign.totalValue,
        {
          value: campaign.totalValue,
        }
      );
    await createCampaignTx.wait();
  });
  it("should check tweets in native", async () => {
    const balanceBefore = await user.getBalance();
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

    const balanceAfter = await user.getBalance();
    expect(balanceAfter).to.be.equal(
      balanceBefore.add(campaign.returningValuePerShare)
    );
  });
  it("should fund campaign in native", async () => {
    const valueToFund = campaign.valuePerShare;
    const balanceBefore = await provider.getBalance(instance.address);
    const fundCampaignTx = await instance
      .connect(creator)
      .fundCampaign(campaign.id, valueToFund, {
        value: valueToFund,
      });

    expect(fundCampaignTx)
      .to.emit(instance, "CampaignFunded")
      .withArgs(campaign.id, valueToFund);
    const balanceAfter = await provider.getBalance(instance.address);
    expect(balanceAfter).to.be.equal(balanceBefore.add(valueToFund));
  });
  it("shouldn't fund campaign in native if different values", async () => {
    const valueToFund = campaign.valuePerShare;
    const fundCampaignTx = instance
      .connect(creator)
      .fundCampaign(campaign.id, valueToFund, {
        value: valueToFund + 1,
      });
    await expect(fundCampaignTx).to.be.revertedWith(
      "Different msg.value from _totalValue"
    );
  });
  it("should withdraw funds from campaign in native", async () => {
    const withdrawValue = Math.floor(campaign.totalValue / 2);
    const withdrawCampaignTx = await instance
      .connect(creator)
      .withdrawFunds(campaign.id, withdrawValue);

    expect(withdrawCampaignTx)
      .to.emit(instance, "CampaignWithdrawn")
      .withArgs(campaign.id, withdrawValue);
    const campaignContract = await instance.campaigns(campaign.id);
    expect(campaignContract.totalValue).to.be.equal(
      campaign.totalValue - withdrawValue
    );
  });
  it("should be able to withdraw fees in native", async () => {
    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = await instance.checkTweet(
      campaign.id,
      user.address,
      userId,
      "tweet_url"
    );
    await checkTweetTx.wait();
    const campaignBefore = await instance.campaigns(campaign.id);
    expect(campaignBefore.totalFees.toNumber()).to.be.greaterThan(0);
    const withdrawFeesTx = await instance.withdrawFees(campaign.id);
    await withdrawFeesTx.wait();
    const campaignAfter = await instance.campaigns(campaign.id);
    expect(campaignAfter.totalFees).to.be.equal(0);
  });
});
