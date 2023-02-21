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


# Create a network interface with public address

resource "azurerm_network_interface" "myNic" {
  name                = "myNic"
  location            = azurerm_resource_group.discBotGPT.location
  resource_group_name = azurerm_resource_group.discBotGPT.name

  ip_configuration {
    name                          = "myNicConfiguration"
    subnet_id                     = azurerm_subnet.mySubnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.myPublicIp.id
  }
}

resource "azurerm_public_ip" "myPublicIp" {
  name                = "myPublicIp"
  location            = azurerm_resource_group.discBotGPT.location
  resource_group_name = azurerm_resource_group.discBotGPT.name
  allocation_method   = "Dynamic"
}

resource "azurerm_virtual_machine" "myVM" {
  name                  = "myVM"
  location              = azurerm_resource_group.discBotGPT.location
  resource_group_name   = azurerm_resource_group.discBotGPT.name
  network_interface_ids = [azurerm_network_interface.myNic.id]

  vm_size             = "Standard_B1s"
  delete_os_disk_on_termination = true

  storage_image_reference {
    publisher = "Canonical"
    offer     = "UbuntuServer"
    sku       = "18.04-LTS"
    version   = "latest"
  }

  storage_os_disk {
    name              = "myOsDisk"
    caching           = "ReadWrite"
    create_option     = "FromImage"
    managed_disk_type = "Standard_LRS"
  }

 // add OS linux profile
    os_profile {
        computer_name  = "myVM"
        admin_username = "myadmin"
        admin_password = "M1#yadminpassword"


    }
    
    os_profile_linux_config {
        disable_password_authentication = false
        ssh_keys = ["${var.ssh_keys}"]
    }
      
}

output "public_ip_address" {
  value = azurerm_public_ip.myPublicIp.ip_address
}


variable "ssh_keys" {
  type = list(string)
  default = [{
    path     = "/home/myadmin/.ssh/authorized_keys"
    key_data = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCsYMdj23JRD02p8aQRZF7QUO/2W2oADgu3ngVnLeP9gsF0Zwkh7JyxNIlMFHM8sLcVErwRSjCwPvU6vdR7TheNhFsX7zicn9uYXmRuWDdkWcQ0J3lijor4ty/qyqb+3SArwKtB7L9EJaCdPx6oitLm42gEmji+pJGVHRTwzHCDXH2ptKZTcpovDH1WnUFDiRIdDojL8+q31Gq9Ns7P8tIiVicc5XQz1sIbsQ7Dtj6dyHU79l9H3Gj16LiHFEPmOa9ka9DgLJTAd+Acrt52PczbapGM7wqKJW+r2jlQQg8EeOvpqvs+PeTYsuQ1DTuTdc0cC7aLgM+i27e+SNqLvZryE4j8ho2r/Lbisx/MD/tUZNAdkXZapm5PZsjFOYb/LAEgoJKP42IDpJqlvmglEWbfwIWD1EagzcjaPrOZjVizgg+8mXJCPDNAuxf3cAc+d9IKNKDfeLvH1aoqT1iRHlNGC/kt9KdTG1SE+XgYDW10fAPJgXDJLG07deHbStj6QWM= quskia@DESKTOP-UIEBEJ5"
  }]
}