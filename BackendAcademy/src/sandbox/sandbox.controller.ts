import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RunCodeDto, SUPPORTED_SANDBOX_LANGUAGES } from "./dto/run-code.dto";
import { SandboxService } from "./sandbox.service";

@ApiTags("sandbox")
@Controller("tasks")
export class SandboxController {
  constructor(private readonly sandbox: SandboxService) {}

  @Post("run")
  run(@Body() dto: RunCodeDto) {
    const language = dto.language ?? "rust";
    if (!SUPPORTED_SANDABOX_LANGUAGES.includes(language)) {
      throw new BadRequestException(`Unsupported language: ${language}`);
    }

    if (dto.testCases !== undefined) {
      return this.sandbox.runRustTests(
        dto.source,
        dto.testCases,
        dto.expectedOutput,
      );
    }
    return this.sandbox.runRust(dto.source);
  }
}
