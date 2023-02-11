# Crypto4All
Crypto4All is a Solidity smart contract that allows for the creation of crowdfunding campaigns for various projects. The contract follows the ERC20 standard and uses OpenZeppelin's Ownable contract for ownership management.

## Dependencies
- Hardhat v2
- Ethers v5
- Yarn


## Compiling and Deploying
- Clone the repository
- Run `yarn install` to install the necessary dependencies
- Compile the contract using `yarn compile`

## Testing

Use the following command, it currently have 100% coverage for all function and branch: 
```bash
yarn test
```

## Contract Functions
- createCampaign
This function allows the creator to create a new campaign.

- setFeePercentage
This function allows the contract owner to set the fee percentage for each campaign.

- updateExecutor
This function allows the contract owner to update the executor address.

- addressFunded
This function returns a boolean indicating whether a specific address has funded a particular campaign.

- userIdFunded
This function returns a boolean indicating whether a specific user ID has funded a particular campaign.

## Contract Events
- CampaignCreated
- CampaignPaused
- CampaignResumed
- CampaignFunded
- CampaignWithdrawn
- CampaignValuePerShareUpdated
- UserFunded