terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
provider "aws" { region = var.region }
variable "region" { default = "eu-central-1" }
variable "ssh_public_key" { type = string }
variable "ssh_cidr" {
  type        = string
  description = "Your client IP in CIDR form, e.g. 203.0.113.4/32."
  validation {
    condition     = can(cidrnetmask(var.ssh_cidr)) && var.ssh_cidr != "0.0.0.0/0"
    error_message = "Supply a restricted IPv4 CIDR for SSH."
  }
}
variable "instance_type" { default = "m6i.xlarge" }
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}
resource "aws_vpc" "node" {
  cidr_block           = "10.78.0.0/16"
  enable_dns_hostnames = true
  tags                = { Name = "freecast" }
}
resource "aws_subnet" "node" {
  vpc_id                  = aws_vpc.node.id
  cidr_block              = "10.78.1.0/24"
  map_public_ip_on_launch = true
}
resource "aws_internet_gateway" "node" { vpc_id = aws_vpc.node.id }
resource "aws_route_table" "node" {
  vpc_id = aws_vpc.node.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.node.id
  }
}
resource "aws_route_table_association" "node" {
  subnet_id      = aws_subnet.node.id
  route_table_id = aws_route_table.node.id
}
resource "aws_security_group" "node" {
  name   = "freecast-node"
  vpc_id = aws_vpc.node.id
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }
  ingress {
    from_port   = 3382
    to_port     = 3382
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_key_pair" "node" {
  key_name_prefix = "freecast-"
  public_key      = var.ssh_public_key
}
resource "aws_instance" "node" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.node.id
  key_name                    = aws_key_pair.node.key_name
  vpc_security_group_ids      = [aws_security_group.node.id]
  associate_public_ip_address = true
  metadata_options { http_tokens = "required" }
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 2000
    encrypted             = true
    delete_on_termination = true
  }
  tags = { Name = "freecast-read-node" }
}
output "public_ip" { value = aws_instance.node.public_ip }
output "ssh" { value = "ssh ubuntu@${aws_instance.node.public_ip}" }
