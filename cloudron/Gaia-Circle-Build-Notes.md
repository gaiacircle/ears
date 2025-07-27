# Gaia Circle - Cloudron Build and Deployment Notes

This document provides instructions for building, testing, and deploying the "Gaia Circle" application to a Cloudron instance.

## Prerequisites

Before you begin, ensure you have the following tools installed on your local machine:

- **Cloudron CLI:** The command-line interface for interacting with your Cloudron instance.
  ```bash
  sudo npm install -g cloudron
  ```
  After installation, log in to your Cloudron:
  ```bash
  cloudron login my.your-cloudron-domain.com
  ```

- **Docker:** A containerization platform used to build and run the application image. You can find installation instructions on the [official Docker website](https://docs.docker.com/get-docker/).

## Building the Image

To build the Docker image for the Gaia Circle application, use the following command. This command uses the `cloudron/Dockerfile` file from the project root and tags the image for a Docker registry.

Replace `your-docker-username` with your actual Docker Hub username or the appropriate registry URL.

```bash
docker build -f cloudron/Dockerfile -t your-docker-username/gaia-circle:1.0.0 .
```

## Pushing the Image

After building the image, push it to your Docker registry. You may need to log in to your Docker registry first using `docker login`.

```bash
docker push your-docker-username/gaia-circle:1.0.0
```

## Installing the App

Once the image is pushed, you can install the application on your Cloudron instance. First, change into the `cloudron` directory, as `CloudronManifest.json` is located there.

```bash
cd cloudron
cloudron install --image your-docker-username/gaia-circle:1.0.0
```

Cloudron will prompt you for a location (subdomain) for the application. After installation, you can open the app using `cloudron open`.

## Updating the App

To update the application with a new version, you need to build a new image with a new tag, push it to the registry, and then use the `cloudron update` command.

It is recommended to use a new version number or a timestamp for the tag.

1.  **Build the new image (from the project root):**
    ```bash
    docker build -f cloudron/Dockerfile -t your-docker-username/gaia-circle:1.0.1 .
    ```

2.  **Push the new image:**
    ```bash
    docker push your-docker-username/gaia-circle:1.0.1
    ```

3.  **Update the application on Cloudron:**
    Change into the `cloudron` directory before running the command.
    ```bash
    cd cloudron
    cloudron update --image your-docker-username/gaia-circle:1.0.1
    ```

For a faster development workflow, you can use the `cloudron build` command, which automates the build and push steps. You must run these commands from the `cloudron` directory.

```bash
cd cloudron
cloudron build
cloudron update --app <your-app-location>