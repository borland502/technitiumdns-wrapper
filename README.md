# bun-sea

Bun Single Executable Application Template

Provides a template project with a file layout and library selection

## Code Execution

### From Source

```shell
    bun run src/main.ts hello
```

### From Binary (~/.local/bin assumed to be in path)

```shell
    task build && task run
```

### From XDG_BIN_HOME

```shell
    bun-sea hello
```

## Libraries

1. [Bun](https://bun.sh/docs/bundler/executables)
2. [Commander](https://github.com/tj/commander.js/tree/master)
3. [Direnv](https://direnv.net)
4. [Winston](https://github.com/winstonjs/winston)
5. [Task](https://taskfile.dev)

> If Task is not already installed it will be downloaded and placed in the $proj/bin folder

## References

- [Bunmagic](https://github.com/bunmagic/bunmagic/tree/main)
- [Commander-template](https://github.com/Qw4z1/commander-template/tree/main)
