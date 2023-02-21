terraform {
  backend "azurerm" {
    resource_group_name  = "discBotGPT"
    storage_account_name = "storagedisbotgptvoice"
    container_name       = "terraformbackend"
    key                  = "terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_storage_account" "storageaccount" {
  name                     = "storagedisbotgptvoice"
  resource_group_name      = azurerm_resource_group.discBotGPT.name
  location                 = azurerm_resource_group.discBotGPT.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = {
    environment = "staging"
  }
}

resource "azurerm_storage_container" "terraformbackend" {
  name                  = "terraformbackend"
  storage_account_name  = azurerm_storage_account.storageaccount.name
  container_access_type = "private"
}

resource "azurerm_resource_group" "discBotGPT" {
  name     = "discBotGPT"
  location = "West Europe"
}

resource "azurerm_virtual_network" "myVnet" {
  name                = "myVnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.discBotGPT.location
  resource_group_name = azurerm_resource_group.discBotGPT.name
}


resource "azurerm_subnet" "mySubnet" {
  name                 = "mySubnet"
  resource_group_name  = azurerm_resource_group.discBotGPT.name
  virtual_network_name = azurerm_virtual_network.myVnet.name
  address_prefixes     = ["10.0.1.0/24"]
}
