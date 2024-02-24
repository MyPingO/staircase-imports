# Contributing to Staircase Imports

Thank you for your interest in contributing to Staircase Imports! Contributions from everyone are welcome and every pull request is appreciated. This document outlines the process to assist in adding your contribution to the project.

## Getting Started

*If you're adding a new feature, consider [opening an issue](https://github.com/MyPingO/staircase-imports/issues/new/choose) to discuss the feature before starting work.  This can help ensure that your changes are aligned with the project's goals and that you're not duplicating work that's already in progress.*


## Step 1: Fork the Repository

Begin by forking the main repository on GitHub. This creates a personal copy of the project for you to work on.

## Step 2: Clone Your Fork

Clone the forked repository to your local machine to start working on the changes:

```shell
git clone https://github.com/yourusername/staircase-imports.git
cd staircase-imports
```

## Step 3: Create a New Branch

Before making any changes, switch to a new branch in your local repository. This helps keep your changes organized and separate from the main branch:

```shell
git checkout -b your-branch-name
```

Choose a branch name that reflects the changes you're making.  

For language specific formatter changes, use a format like:  
 `language-feature-description` or `language-bugfix-description`,  
 where `language` is the programming language your changes relate to  
 (e.g., `python-edge-case-handling`, or `rust-support-integration`).  
 
This naming convention helps in quickly identifying the focus and scope of the changes.

## Step 4: Make Your Changes

With your environment set up and your branch created, you're ready to start making changes.  
Feel free to add new features, fix bugs, or improve the codebase in any other way!

## Step 5: Test Your Changes

Before submitting your changes, it's important to test them locally to ensure they work as expected. 

This can include running unit tests, manual testing, or any other relevant validation.  
You are encouraged to add new tests to cover your changes, if applicable.  

Test are located in the `tests` directory and must be named `fileName.test.js`.  
You can run all tests in the `testing` interface inside of VSCode or by running the following command in the terminal:

```shell
npm test
```

If everything looks good, you're ready to commit your changes.

## Step 6: Commit Your Changes

After you've made your changes, commit them to your branch using a descriptive message:

```shell
git commit -am "A concise, descriptive commit message"
```

## Step 7: Push Your Branch

Push your branch and the accompanying changes to your GitHub fork:

```shell
git push origin your-branch-name
```

## Step 8: Open a Pull Request

Once your changes are pushed, navigate to the [original Staircase Imports repository on GitHub](https://github.com/MyPingO/staircase-imports). You should see a prompt to open a pull request from your new branch. Click the "Compare & pull request" button, then fill out the pull request form with a clear description of your changes.

## Pull Request Review

After you've submitted a pull request, a project maintainer will review your changes. If they request further changes or improvements, please make the requested updates to your branch. Your changes will automatically be updated in the pull request.

Pull requests are reviewed and merged promptly. Open communication and discussion are encouraged to ensure contributions can be integrated effectively.

**Thank you for contributing to Staircase Imports. Your efforts help make the extension better for everyone!**