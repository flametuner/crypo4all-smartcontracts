//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Crypto4You is Ownable {
  uint256 public constant INVERSE_BASIS = 10000;
  uint256 public feePercentage = 1000;

  address public executor;

  mapping(uint256 => Campaign) public campaigns;

  event CampaignCreated(
    uint256 indexed campaignId,
    address tokenAddress,
    uint256 valuePerShare,
    uint256 totalValue
  );

  event CampaignStarted(uint256 indexed campaignId);
  event CampaignPaused(uint256 indexed campaignId);
  event CampaignResumed(uint256 indexed campaignId);
  event CampaignFunded(uint256 indexed campaignId, uint256 amount);
  event CampaignWithdrawn(uint256 indexed campaignId, uint256 amount);
  event CampaignValuePerShareUpdated(
    uint256 indexed campaignId,
    uint256 valuePerShare
  );
  event UserFunded(
    uint256 indexed campaignId,
    address indexed user,
    string tweetId
  );

  struct Campaign {
    address creator;
    address tokenAddress;
    uint256 valuePerShare;
    uint256 feePerShare;
    uint256 totalValue;
    uint256 totalFees;
    bool paused;
    mapping(address => bool) usersFund;
    mapping(string => bool) tweetIds;
  }

  modifier onlyExecutor() {
    require(_msgSender() == executor, "Only executor");
    _;
  }

  modifier onlyCreator(uint256 campaignId) {
    require(_msgSender() == campaigns[campaignId].creator, "Only creator");
    _;
  }

  constructor(address _executor, uint256 _feePercentage) {
    executor = _executor;
    feePercentage = _feePercentage;
  }

  function setFeePercentage(uint256 _feePercentage) public onlyOwner {
    require(_feePercentage < 1000, "Fee max is 10%");
    feePercentage = _feePercentage;
  }

  function updateExecutor(address _executor) public onlyOwner {
    executor = _executor;
  }

  function createCampaign(
    uint256 _campaignId,
    address _token,
    uint256 _valuePerShare,
    uint256 _totalValue
  ) public {
    require(
      campaigns[_campaignId].creator == address(0x0),
      "Campaing already created"
    );
    require(_token != address(0x0), "Token address must be valid");
    require(_valuePerShare > 0, "share must be greater than 0");
    require(_totalValue > 0, "Total must be greater than 0");
    require(_valuePerShare <= _totalValue, "share must be less than Total");

    require(
      IERC20(_token).transferFrom(_msgSender(), address(this), _totalValue),
      "Couldn't transfer campaing funds"
    );

    Campaign storage newCampaign = campaigns[_campaignId];
    newCampaign.creator = _msgSender();
    newCampaign.tokenAddress = _token;
    newCampaign.feePerShare = (_valuePerShare * feePercentage) / INVERSE_BASIS;
    newCampaign.valuePerShare = _valuePerShare - newCampaign.feePerShare;
    newCampaign.totalValue = _totalValue;

    emit CampaignCreated(_campaignId, _token, _valuePerShare, _totalValue);
    emit CampaignStarted(_campaignId);
  }

  function batchCheckTweets(
    uint256 _campaignId,
    address[] memory _users,
    string[] memory _tweetIds
  ) public onlyExecutor {
    require(_users.length == _tweetIds.length, "must have the same length");
    for (uint256 i = 0; i < _users.length; i++) {
      checkTweets(_campaignId, _users[i], _tweetIds[i]);
    }
  }

  function checkTweets(
    uint256 _campaignId,
    address _user,
    string memory _tweetId
  ) public onlyExecutor {
    require(_user != address(0x0), "User address must be valid");
    require(bytes(_tweetId).length > 0, "Tweet Id can't be empty");

    Campaign storage campaign = campaigns[_campaignId];

    require(campaign.paused == false, "Campaign is paused");

    require(campaign.usersFund[_user] == false, "User already funded");
    require(campaign.tweetIds[_tweetId] == false, "Tweet already used");
    campaign.usersFund[_user] = true;
    campaign.tweetIds[_tweetId] = true;

    campaign.totalValue -= campaign.valuePerShare + campaign.feePerShare;
    campaign.totalFees += campaign.feePerShare;
    IERC20(campaign.tokenAddress).transfer(_user, campaign.valuePerShare);

    emit UserFunded(_campaignId, _user, _tweetId);

    verifyForPausing(_campaignId);
  }

  function resumeCampaign(uint256 _campaignId) public onlyCreator(_campaignId) {
    Campaign storage campaign = campaigns[_campaignId];
    require(campaign.paused, "Campaign is not paused");
    require(
      campaign.totalValue >= campaign.valuePerShare + campaign.feePerShare,
      "Campaign has no funds"
    );
    campaign.paused = false;
    emit CampaignStarted(_campaignId);
  }

  function pauseCampaign(uint256 _campaignId) public onlyCreator(_campaignId) {
    _pauseCampaign(_campaignId);
  }

  function verifyForPausing(uint256 _campaignId) internal {
    Campaign storage campaign = campaigns[_campaignId];
    if (campaign.totalValue < campaign.valuePerShare + campaign.feePerShare) {
      _pauseCampaign(_campaignId);
    }
  }

  function _pauseCampaign(uint256 _campaignId) private {
    campaigns[_campaignId].paused = true;
    emit CampaignPaused(_campaignId);
  }

  function fundCampaign(uint256 _campaignId, uint256 amount)
    public
    onlyCreator(_campaignId)
  {
    Campaign storage campaign = campaigns[_campaignId];

    require(
      IERC20(campaign.tokenAddress).transferFrom(
        _msgSender(),
        address(this),
        amount
      ),
      "Couldn't transfer campaing funds"
    );

    campaign.totalValue += amount;
    emit CampaignFunded(_campaignId, amount);
  }

  // Withdraw funds from the campaign
  function withdrawFunds(uint256 _campaignId, uint256 _withdrawValue)
    public
    onlyCreator(_campaignId)
  {
    require(_withdrawValue > 0, "Value must be greater than 0");
    Campaign storage campaign = campaigns[_campaignId];
    require(_withdrawValue <= campaign.totalValue, "Withdraw value too high");

    campaign.totalValue -= _withdrawValue;
    IERC20(campaign.tokenAddress).transfer(_msgSender(), _withdrawValue);

    emit CampaignWithdrawn(_campaignId, _withdrawValue);
    verifyForPausing(_campaignId);
  }

  function updateValuePerShare(uint256 _campaignId, uint256 _valuePerShare)
    public
    onlyCreator(_campaignId)
  {
    require(_valuePerShare > 0, "Value must be greater than 0");
    Campaign storage campaign = campaigns[_campaignId];
    require(_valuePerShare <= campaign.totalValue, "Invalid Value per share");

    campaign.feePerShare =
      (_valuePerShare * feePercentage) /
      INVERSE_BASIS;
    campaign.valuePerShare = _valuePerShare - campaign.feePerShare;
    emit CampaignValuePerShareUpdated(_campaignId, _valuePerShare);
  }

  // Permit owner to withdraw fees from specific campaign
  function withdrawFees(uint256 _campaignId) public onlyOwner {
    Campaign storage campaign = campaigns[_campaignId];
    require(campaign.totalFees > 0, "Amount must be greater than 0");

    uint256 totalFees = campaign.totalFees;
    campaign.totalFees = 0;
    IERC20(campaign.tokenAddress).transfer(_msgSender(), totalFees);
  }

  // Batch withdraw fees from campaign array
  function batchWithdrawFees(uint256[] memory _campaignIds) public onlyOwner {
    for (uint256 i = 0; i < _campaignIds.length; i++) {
      withdrawFees(_campaignIds[i]);
    }
  }
}
