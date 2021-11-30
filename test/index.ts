import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
// eslint-disable-next-line node/no-missing-import
import { Crypto4You, TestToken } from "../typechain";
// eslint-disable-next-line node/no-missing-import
import { Campaign, generateCampaign } from "./util";

describe("Fee Percentage", function () {
  let instance: Crypto4You;
  let executor: SignerWithAddress;
  // Deploy the contract
  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    [, executor] = await ethers.getSigners();
    instance = await Crypto4You.deploy(executor.address, 5000);
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
      .connect(executor)
      .setFeePercentage(1000);

    await expect(setFeePertcentageTx).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});

describe("Executor Update", function () {
  let instance: Crypto4You;
  let executor: SignerWithAddress;
  // Deploy the contract
  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    [, executor] = await ethers.getSigners();
    instance = await Crypto4You.deploy(executor.address, 5000);
    await instance.deployed();
  });

  it("should update the executor", async () => {
    const anotherExecutor = (await ethers.getSigners())[3];

    const updateExecutorTx = await instance.updateExecutor(
      anotherExecutor.address
    );
    await updateExecutorTx.wait();

    expect(await instance.executor()).to.equal(anotherExecutor.address);
  });

  it("shouldn't update executor if not owner", async () => {
    const anotherExecutor = (await ethers.getSigners())[3];

    const updateExecutorTx = instance
      .connect(executor)
      .updateExecutor(anotherExecutor.address);

    await expect(updateExecutorTx).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});

describe("Create Campaign", function () {
  let instance: Crypto4You;
  let owner: SignerWithAddress;
  let executor: SignerWithAddress;
  let erc20: TestToken;
  let campaignId: number;
  let feePercentage: number;
  let campaign: Campaign;
  // Deploy the contract

  before(async () => {
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    [owner, executor] = await ethers.getSigners();

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
      owner.address,
      erc20.address,
      feePercentage
    );
    const mintTx = await erc20.mint(owner.address, campaign.totalValue); // 21 million
    await mintTx.wait();
  });
  it("should create campaign", async () => {
    const approveTx = await erc20.approve(
      instance.address,
      campaign.totalValue
    );
    await approveTx.wait();

    const createCampaignTx = await instance.createCampaign(
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
    expect(createCampaignTx)
      .to.emit(instance, "CampaignStarted")
      .withArgs(campaign.id);

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
    const createCampaignTx = instance.createCampaign(
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

    const createCampaignTx = instance.createCampaign(
      campaign.id,
      notERC20Address,
      campaign.valuePerShare,
      campaign.totalValue
    );

    await expect(createCampaignTx).to.be.reverted;
  });
  it("shouldn't create campaign for non-erc20 token address", async () => {
    const createCampaignTx = instance.createCampaign(
      campaign.id,
      instance.address,
      campaign.valuePerShare,
      campaign.totalValue
    );

    await expect(createCampaignTx).to.be.reverted;
  });
  it("shouldn't create campaign if invalid value per share", async () => {
    const createCampaignTx = instance.createCampaign(
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
    const createCampaignTx = instance.createCampaign(
      campaign.id,
      campaign.tokenAddress,
      campaign.totalValue,
      0
    );

    await expect(createCampaignTx).to.be.revertedWith("must be greater than 0");
    const createCampaignTx2 = instance.createCampaign(
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

describe("Check tweets", () => {
  let instance: Crypto4You;
  let owner: SignerWithAddress;
  let executor: SignerWithAddress;
  let user: SignerWithAddress;
  let erc20: TestToken;
  let campaignId: number;
  let feePercentage: number;
  let campaign: Campaign;
  let userIdCounter: number;
  // Deploy the contract

  before(async () => {
    campaignId = 0;
    userIdCounter = 0;
    const Crypto4You = await ethers.getContractFactory("Crypto4You");
    const TestToken = await ethers.getContractFactory("TestToken");
    [owner, executor, user] = await ethers.getSigners();

    instance = await Crypto4You.deploy(executor.address, 5000);
    await instance.deployed();

    erc20 = await TestToken.deploy();
    await erc20.deployed();

    feePercentage = (await instance.feePercentage()).toNumber();

    campaign = generateCampaign(
      campaignId++,
      owner.address,
      erc20.address,
      feePercentage
    );
    const mintTx = await erc20.mint(owner.address, campaign.totalValue); // 21 million
    await mintTx.wait();
    const approveTx = await erc20.approve(
      instance.address,
      campaign.totalValue
    );
    await approveTx.wait();
    const createCampaignTx = await instance.createCampaign(
      campaign.id,
      campaign.tokenAddress,
      campaign.valuePerShare,
      campaign.totalValue
    );
    await createCampaignTx.wait();
  });

  it("should check tweets", async () => {
    const balanceBefore = await erc20.balanceOf(user.address);

    const userId = `random_id_${userIdCounter++}`;
    const checkTweetTx = await instance
      .connect(executor)
      .checkTweet(campaign.id, user.address, userId, "tweet_url");

    expect(checkTweetTx)
      .to.emit(instance, "UserFunded")
      .withArgs(campaign.id, user.address, "tweet_url");

    const balanceAfter = await erc20.balanceOf(user.address);

    expect(balanceAfter.sub(balanceBefore)).to.be.equal(
      campaign.returningValuePerShare
    );
  });
});
