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
    string tweetUrl
  );

  struct Campaign {
    address creator;
    address tokenAddress;
    uint256 valuePerShare;
    uint256 feePerShare;
    uint256 totalValue;
    uint256 totalFees;
    bool paused;
    mapping(address => bool) addressFunded;
    mapping(string => bool) userIdsFunded;
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
    updateExecutor(_executor);
    setFeePercentage(_feePercentage);
  }

  function addressFunded(uint256 campaignId, address user)
    public
    view
    returns (bool)
  {
    return campaigns[campaignId].addressFunded[user];
  }

  function userIdFunded(uint256 campaignId, string calldata userId)
    public
    view
    returns (bool)
  {
    return campaigns[campaignId].userIdsFunded[userId];
  }

  function setFeePercentage(uint256 _feePercentage) public onlyOwner {
    require(_feePercentage <= 1000, "Fee max is 10%");
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
      "Campaign already created"
    );
    require(_valuePerShare > 0 && _totalValue > 0, "must be greater than 0");
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

    emit CampaignCreated(
      _campaignId,
      _token,
      newCampaign.valuePerShare,
      _totalValue
    );
  }

  function batchCheckTweets(
    uint256[] calldata _campaignId,
    address[] calldata _users,
    string[] calldata _userIdsFunded,
    string[] calldata _tweetUrls
  ) public onlyExecutor {
    require(
      _campaignId.length == _users.length &&
      _users.length == _userIdsFunded.length &&
        _userIdsFunded.length == _tweetUrls.length,
      "must have the same length"
    );
    for (uint256 i = 0; i < _users.length; i++) {
      checkTweet(_campaignId[i], _users[i], _userIdsFunded[i], _tweetUrls[i]);
    }
  }

  function checkTweet(
    uint256 _campaignId,
    address _user,
    string calldata _twitterUserId,
    string calldata _tweetUrl
  ) public onlyExecutor {
    require(_user != address(0x0), "User address must be valid");
    require(bytes(_twitterUserId).length > 0, "User Id can't be empty");
    require(bytes(_tweetUrl).length > 0, "Tweet URL can't be empty");

    Campaign storage campaign = campaigns[_campaignId];

    require(
      campaigns[_campaignId].creator != address(0x0),
      "Campaign isn't created"
    );
    require(campaign.paused == false, "Campaign is paused");

    require(campaign.addressFunded[_user] == false, "User already funded");
    require(
      campaign.userIdsFunded[_twitterUserId] == false,
      "Tweet already used"
    );
    campaign.addressFunded[_user] = true;
    campaign.userIdsFunded[_twitterUserId] = true;

    campaign.totalValue -= campaign.valuePerShare + campaign.feePerShare;
    campaign.totalFees += campaign.feePerShare;
    IERC20(campaign.tokenAddress).transfer(_user, campaign.valuePerShare);

    emit UserFunded(_campaignId, _user, _tweetUrl);

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
    emit CampaignResumed(_campaignId);
  }

  function pauseCampaign(uint256 _campaignId) public onlyCreator(_campaignId) {
    require(!campaigns[_campaignId].paused, "Campaign is already paused");
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

    campaign.feePerShare = (_valuePerShare * feePercentage) / INVERSE_BASIS;
    campaign.valuePerShare = _valuePerShare - campaign.feePerShare;
    emit CampaignValuePerShareUpdated(_campaignId, _valuePerShare);
  }

  // Permit owner to withdraw fees from specific campaign
  function withdrawFees(uint256 _campaignId) public onlyOwner {
    Campaign storage campaign = campaigns[_campaignId];
    require(campaign.totalFees > 0, "Fee must be greater than 0");

    uint256 totalFees = campaign.totalFees;
    campaign.totalFees = 0;
    IERC20(campaign.tokenAddress).transfer(_msgSender(), totalFees);
  }

  // Batch withdraw fees from campaign array
  function batchWithdrawFees(uint256[] calldata _campaignIds) public onlyOwner {
    for (uint256 i = 0; i < _campaignIds.length; i++) {
      withdrawFees(_campaignIds[i]);
    }
  }
}
